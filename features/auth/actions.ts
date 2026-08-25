"use server";

import { revalidatePath } from "next/cache";

import { signInSchema, signUpSchema } from "@/features/auth/schemas";
import type { AuthActionState } from "@/features/auth/state";
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
  try {
    await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
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
  let error: unknown;

  try {
    ({ error } = await supabase.auth.signInWithPassword(parsed.data));
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  if (error !== null) {
    return actionFailure(new DomainError("AUTH_FAILED", { cause: error }));
  }

  revalidatePath("/", "layout");

  return actionSuccess({
    message: "Signed in. Taking you back to Huddle…",
    redirectTo: "/",
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
