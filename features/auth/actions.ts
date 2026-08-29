"use server";

import { revalidatePath } from "next/cache";

import { signInSchema, signUpSchema } from "@/features/auth/schemas";
import type { AuthActionState } from "@/features/auth/state";
import { getPublicEnvironment } from "@/lib/env/public";
import { actionFailure, actionSuccess, DomainError } from "@/lib/errors";
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
  let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;

  try {
    signInResult = await supabase.auth.signInWithPassword(parsed.data);
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  if (signInResult.error !== null || signInResult.data.user === null) {
    return actionFailure(new DomainError("AUTH_FAILED", { cause: signInResult.error }));
  }

  let redirectTo = "/settings/profile";
  try {
    const profileResult = await supabase
      .from("profiles")
      .select("profile_completed_at")
      .eq("id", signInResult.data.user.id)
      .maybeSingle();
    if (
      profileResult.error === null &&
      profileResult.data?.profile_completed_at !== null &&
      profileResult.data?.profile_completed_at !== undefined
    ) {
      redirectTo = "/";
    }
  } catch {
    // A verified user with an unavailable or incomplete profile is safest in
    // the onboarding route, which already renders a controlled service state.
  }

  revalidatePath("/", "layout");

  return actionSuccess({
    message:
      redirectTo === "/settings/profile"
        ? "Signed in. Let’s finish setting up your account…"
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

  revalidatePath("/", "layout");

  return actionSuccess({
    message: "Signed out.",
    redirectTo: "/",
  });
}
