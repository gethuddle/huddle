"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  passwordResetRequestSchema,
  passwordUpdateSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";
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
import { actionFailure, actionSuccess, DomainError } from "@/lib/errors";
import { safeInternalRedirect } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const environment = getPublicEnvironment();
  try {
    await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: new URL(
          "/auth/verify/callback",
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
    redirectTo: null,
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
    const supabase = await createClient();
    const environment = getPublicEnvironment();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: new URL(
        "/auth/reset-password/callback",
        environment.NEXT_PUBLIC_APP_URL,
      ).toString(),
    });
  } catch {
    // The response remains identical for unknown accounts, provider throttling,
    // and temporary transport failures so the form cannot enumerate identities.
  }

  return actionSuccess({
    message: "If that address can receive Huddle mail, a password reset link is on its way.",
    redirectTo: null,
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

  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error !== null || data.user === null) {
      return actionFailure(new DomainError("AUTH_REQUIRED", { cause: error }));
    }
  } catch (cause) {
    return actionFailure(new DomainError("AUTH_REQUIRED", { cause }));
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error !== null) {
      return actionFailure(new DomainError("INTERNAL_ERROR", { cause: error }));
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError !== null) {
      return actionFailure(new DomainError("INTERNAL_ERROR", { cause: signOutError }));
    }
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
  revalidatePath("/", "layout");
  redirect("/auth/sign-in?reset=success");
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
