"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { erasePolarExternalCustomer } from "@/features/venue-billing/polar";

import {
  RECOVERY_GRANT_COOKIE_NAME,
  recoveryGrantCookieOptions,
} from "@/features/auth/recovery-grant";
import {
  isInvalidCredentialsAuthError,
  isMissingAuthSessionError,
} from "@/features/auth/provider-errors";
import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
  huddleSessionCleanupCookieOptions,
} from "@/features/auth/session-cleanup-cookie";
import type { AuthActionState } from "@/features/auth/state";
import { WORKSPACE_COOKIE_NAME, workspaceCookieOptions } from "@/features/workspaces/state";
import { getServerEnvironment } from "@/lib/env/server";
import { actionFailure, DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

import { deleteAccountSchema } from "./schema";

function currentPasswordFailure(cause?: unknown): AuthActionState {
  return actionFailure(
    new DomainError("VALIDATION_FAILED", {
      cause,
      fields: { currentPassword: ["Current password is incorrect."] },
    }),
  );
}

function currentUserFailure(cause: unknown): AuthActionState {
  return actionFailure(
    new DomainError(isMissingAuthSessionError(cause) ? "AUTH_REQUIRED" : "UPSTREAM_UNAVAILABLE", {
      cause,
    }),
  );
}

function reauthenticationFailure(cause: unknown): AuthActionState {
  return isInvalidCredentialsAuthError(cause)
    ? currentPasswordFailure(cause)
    : actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
}

export async function deleteAccountAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  void _previousState;

  const parsed = deleteAccountSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string; email: string };
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error !== null) return currentUserFailure(error);
    if (!data.user?.email) return actionFailure(new DomainError("AUTH_REQUIRED"));
    user = { id: data.user.id, email: data.user.email };
  } catch (cause) {
    return currentUserFailure(cause);
  }

  try {
    const reauthentication = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    });
    if (reauthentication.error !== null) return reauthenticationFailure(reauthentication.error);
    if (reauthentication.data.user?.id !== user.id) {
      return actionFailure(new DomainError("AUTH_REQUIRED"));
    }
  } catch (cause) {
    return reauthenticationFailure(cause);
  }

  let requestId: string;
  let cleanupRequired: boolean;
  let cleanupToken: string | null;
  try {
    requestId = await getRequestId();
    const { data, error } = await supabase.rpc("prepare_account_erasure_v2", {
      input_confirmation: parsed.data.confirmation,
      audit_request_id: requestId,
    });
    if (error !== null) return actionFailure(domainErrorFromDatabase(error));
    const preparation = z
      .array(
        z
          .object({
            prepared: z.literal(true),
            polar_cleanup_required: z.boolean(),
            cleanup_token: z.uuid().nullable(),
          })
          .strict(),
      )
      .length(1)
      .parse(data)[0]!;
    cleanupRequired = preparation.polar_cleanup_required;
    cleanupToken = preparation.cleanup_token;
    if (cleanupRequired && cleanupToken === null) throw new Error("Missing cleanup fence");
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  try {
    if (cleanupRequired) await erasePolarExternalCustomer(user.id);
    const admin = createServiceRoleClient();
    if (cleanupRequired) {
      const completion = await admin.rpc("complete_polar_account_erasure_cleanup", {
        input_actor_id: user.id,
        input_request_id: requestId,
        input_cleanup_token: cleanupToken!,
      });
      if (completion.error !== null) throw completion.error;
    }
    const { error } = await admin.auth.admin.deleteUser(user.id, true);
    if (error !== null) {
      return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause: error }));
    }
  } catch (cause) {
    return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE", { cause }));
  }

  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) {
      cookieStore.set(name, "", { maxAge: 0, path: "/" });
    }
  }

  const environment = getServerEnvironment();
  cookieStore.set(RECOVERY_GRANT_COOKIE_NAME, "", {
    ...recoveryGrantCookieOptions(environment.HUDDLE_ENVIRONMENT),
    maxAge: 0,
  });
  cookieStore.set(WORKSPACE_COOKIE_NAME, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
  cookieStore.set(
    HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
    HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.accountErasure,
    huddleSessionCleanupCookieOptions(environment.HUDDLE_ENVIRONMENT),
  );
  revalidatePath("/", "layout");
  redirect("/auth/sign-in?account=deleted");
}
