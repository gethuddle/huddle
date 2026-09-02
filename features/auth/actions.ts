"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  knownPasswordUpdateSchema,
  passwordResetRequestSchema,
  passwordUpdateSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";
import {
  RECOVERY_GRANT_COOKIE_NAME,
  recoveryGrantCookieOptions,
  verifyRecoveryGrant,
} from "@/features/auth/recovery-grant";
import type { AuthActionState } from "@/features/auth/state";
import { parseWorkspaceCookie, workspaceRowsSchema } from "@/features/workspaces/schemas";
import {
  chooseWorkspace,
  serializeWorkspaceSelection,
  WORKSPACE_COOKIE_NAME,
  workspaceCookieOptions,
  workspaceLanding,
} from "@/features/workspaces/state";
import { getPublicEnvironment } from "@/lib/env/public";
import { getServerEnvironment } from "@/lib/env/server";
import { actionFailure, actionSuccess, DomainError } from "@/lib/errors";
import { safeInternalRedirect } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken, type TurnstileAction } from "@/features/auth/turnstile";

async function verifyAuthTurnstile(formData: FormData, expectedAction: TurnstileAction) {
  const environment = getServerEnvironment();
  if (!environment.AUTH_TURNSTILE_ENABLED) return;

  const requestHeaders = await headers();
  const remoteIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const token = formData.get("cf-turnstile-response");
  await verifyTurnstileToken({
    token: typeof token === "string" ? token : "",
    expectedAction,
    secret: environment.TURNSTILE_SECRET!,
    expectedHostnames: environment.TURNSTILE_HOSTNAMES!,
    ...(remoteIp === undefined || remoteIp === "" ? {} : { remoteIp }),
  });
}

export async function signUpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionFailure(parsed.error);
  }

  try {
    await verifyAuthTurnstile(formData, "signup");
  } catch (cause) {
    return actionFailure(cause);
  }

  const supabase = await createClient();
  const environment = getPublicEnvironment();
  try {
    await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: new URL(
          "/auth/verify/confirm",
          environment.NEXT_PUBLIC_APP_URL,
        ).toString(),
      },
    });
  } catch {
    // Keep the signup response identical: neither an account lookup nor an
    // upstream failure may reveal whether this address already exists.
  }

  // Deliberately identical whether Supabase created a user, protected an
  // existing identity, or declined the request. The verification email is the
  // only proof available to the person controlling the address.
  return actionSuccess({
    message: "If that address can receive Huddle mail, a verification link is on its way.",
    redirectTo: "/auth/verify",
  });
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return actionFailure(parsed.error);
  }

  try {
    await verifyAuthTurnstile(formData, "password_reset");
  } catch (cause) {
    return actionFailure(cause);
  }

  try {
    const supabase = await createClient();
    const environment = getPublicEnvironment();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: new URL(
        "/auth/reset-password/confirm",
        environment.NEXT_PUBLIC_APP_URL,
      ).toString(),
    });
  } catch {
    // The response remains identical for unknown accounts, provider throttling,
    // and temporary transport failures so the form cannot enumerate identities.
  }

  return actionSuccess({
    message: "If that address can receive Huddle mail, a password reset link is on its way.",
    redirectTo: "/auth/forgot-password?status=sent",
  });
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionFailure(parsed.error);
  }

  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const environment = getServerEnvironment();
  try {
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    const sessionId = data?.claims.session_id;
    const grant = cookieStore.get(RECOVERY_GRANT_COOKIE_NAME)?.value;
    if (
      error !== null ||
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      grant === undefined
    ) {
      return actionFailure(new DomainError("AUTH_REQUIRED", { cause: error }));
    }
    verifyRecoveryGrant(grant, { userId, sessionId }, environment.AUTH_RECOVERY_TOKEN_SECRET);
  } catch (cause) {
    return actionFailure(new DomainError("AUTH_REQUIRED", { cause }));
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error !== null) {
      return actionFailure(new DomainError("INTERNAL_ERROR", { cause: error }));
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError !== null) {
      return actionFailure(new DomainError("INTERNAL_ERROR", { cause: signOutError }));
    }
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  cookieStore.set(RECOVERY_GRANT_COOKIE_NAME, "", {
    ...recoveryGrantCookieOptions(environment.HUDDLE_ENVIRONMENT),
    maxAge: 0,
  });
  cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
  revalidatePath("/", "layout");
  redirect("/auth/sign-in?password=changed");
}

export async function changePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = knownPasswordUpdateSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  const supabase = await createClient();
  let email: string;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error !== null || data.user?.email === undefined) {
      return actionFailure(new DomainError("AUTH_REQUIRED", { cause: error }));
    }
    email = data.user.email;
  } catch (cause) {
    return actionFailure(new DomainError("AUTH_REQUIRED", { cause }));
  }

  try {
    const reauthentication = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.currentPassword,
    });
    if (reauthentication.error !== null || reauthentication.data.user === null) {
      return actionFailure(
        new DomainError("VALIDATION_FAILED", {
          cause: reauthentication.error,
          fields: { currentPassword: ["Current password is incorrect."] },
        }),
      );
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
      current_password: parsed.data.currentPassword,
    });
    if (error !== null) return actionFailure(new DomainError("INTERNAL_ERROR", { cause: error }));

    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError !== null) {
      return actionFailure(new DomainError("INTERNAL_ERROR", { cause: signOutError }));
    }
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  const cookieStore = await cookies();
  const environment = getServerEnvironment();
  cookieStore.set(RECOVERY_GRANT_COOKIE_NAME, "", {
    ...recoveryGrantCookieOptions(environment.HUDDLE_ENVIRONMENT),
    maxAge: 0,
  });
  cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
  revalidatePath("/", "layout");
  redirect("/auth/sign-in?password=changed");
}

export async function cancelRecoveryAction() {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Local state is cleared below even when the provider session is unavailable.
  }
  const cookieStore = await cookies();
  const environment = getServerEnvironment();
  cookieStore.set(RECOVERY_GRANT_COOKIE_NAME, "", {
    ...recoveryGrantCookieOptions(environment.HUDDLE_ENVIRONMENT),
    maxAge: 0,
  });
  cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
  revalidatePath("/", "layout");
  redirect("/auth/sign-in");
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return actionFailure(parsed.error);
  }

  try {
    await verifyAuthTurnstile(formData, "login");
  } catch (cause) {
    return actionFailure(cause);
  }

  const supabase = await createClient();
  const requestedNext = safeInternalRedirect(formData.get("next"), "");
  let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;

  try {
    signInResult = await supabase.auth.signInWithPassword(parsed.data);
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  if (signInResult.error !== null || signInResult.data.user === null) {
    return actionFailure(new DomainError("AUTH_FAILED", { cause: signInResult.error }));
  }

  let redirectTo = "/onboarding";
  try {
    const { data, error } = await supabase.rpc("list_my_workspaces");
    if (error === null) {
      const available = workspaceRowsSchema.parse(data).map((workspace) => ({
        kind: workspace.workspace_kind,
        id: workspace.workspace_id,
        slug: workspace.slug,
        label: workspace.name,
        role: workspace.role,
      }));
      const cookieStore = await cookies();
      const remembered = parseWorkspaceCookie(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value);
      const active = chooseWorkspace(available, remembered);

      if (active === null) {
        cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
          ...workspaceCookieOptions(),
          maxAge: 0,
        });
      } else {
        cookieStore.set(
          WORKSPACE_COOKIE_NAME,
          serializeWorkspaceSelection({ kind: active.kind, id: active.id }),
          workspaceCookieOptions(),
        );
        redirectTo = workspaceLanding(active);
        if (requestedNext !== "") redirectTo = requestedNext;
      }
    }
  } catch {
    // Workspace state is an authorization projection. If it is unavailable or
    // malformed, resume from setup instead of trusting a remembered cookie.
  }

  revalidatePath("/", "layout");

  return actionSuccess({
    message:
      redirectTo === "/onboarding"
        ? "Signed in. Choose how you’ll use Huddle…"
        : "Signed in. Taking you back to Huddle…",
    redirectTo,
  });
}

export async function signOutAction(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  void _previousState;
  void _formData;

  const supabase = await createClient();
  let error: unknown;

  try {
    ({ error } = await supabase.auth.signOut({ scope: "local" }));
  } catch (cause) {
    return actionFailure(new DomainError("INTERNAL_ERROR", { cause }));
  }

  if (error !== null) {
    return actionFailure(new DomainError("INTERNAL_ERROR", { cause: error }));
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
  revalidatePath("/", "layout");

  return actionSuccess({
    message: "Signed out.",
    redirectTo: "/",
  });
}
