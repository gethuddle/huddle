"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireActor } from "@/features/auth/actor";
import { fanWorkspaceInputSchema } from "@/features/profiles/schemas";
import type { ProfileActionState, ProfileFormValues } from "@/features/profiles/state";
import { workspaceRowsSchema } from "@/features/workspaces/schemas";
import {
  serializeWorkspaceSelection,
  WORKSPACE_COOKIE_NAME,
  workspaceCookieOptions,
} from "@/features/workspaces/state";
import { domainErrorFromDatabase, DomainError, toActionError } from "@/lib/errors";

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): ProfileFormValues {
  return {
    handle: formString(formData.get("handle")),
    displayName: formString(formData.get("displayName")),
    bio: formString(formData.get("bio")),
    adultAttested: formData.get("adultAttested") === "on",
    rulesAccepted: formData.get("rulesAccepted") === "on",
  };
}

function profileActionFailure(
  error: unknown,
  values: ProfileFormValues,
  previousState: ProfileActionState,
): ProfileActionState {
  return {
    ok: false,
    error: toActionError(error),
    values,
    attempt: previousState?.ok === false ? previousState.attempt + 1 : 1,
  };
}

async function activateFanWorkspace(
  previousState: ProfileActionState,
  formData: FormData,
  destination: "home" | "profile",
): Promise<ProfileActionState> {
  const values = submittedValues(formData);
  const parsed = fanWorkspaceInputSchema.safeParse({
    handle: formData.get("handle"),
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    adultAttested: formData.get("adultAttested"),
    rulesAccepted: formData.get("rulesAccepted"),
    rulesVersion: formData.get("rulesVersion"),
  });

  if (!parsed.success) {
    return profileActionFailure(parsed.error, values, previousState);
  }

  try {
    const { supabase, user } = await requireActor("authenticated");
    const { data, error } = await supabase.rpc("activate_fan_workspace", {
      input_handle: parsed.data.handle,
      input_display_name: parsed.data.displayName,
      input_bio: parsed.data.bio,
      input_adult_attested: parsed.data.adultAttested,
      input_rules_version: parsed.data.rulesVersion,
    });

    if (error !== null) {
      throw domainErrorFromDatabase(error);
    }

    const completedProfile = data.at(0);
    if (completedProfile === undefined) {
      throw new DomainError("INTERNAL_ERROR");
    }

    if (destination === "home") {
      const { data: currentWorkspaces, error: workspaceError } =
        await supabase.rpc("list_my_workspaces");
      if (workspaceError !== null) throw domainErrorFromDatabase(workspaceError);
      const fan = workspaceRowsSchema
        .parse(currentWorkspaces)
        .find(
          (workspace) => workspace.workspace_kind === "fan" && workspace.workspace_id === user.id,
        );
      if (fan === undefined) throw new DomainError("NOT_ALLOWED");

      const cookieStore = await cookies();
      cookieStore.set(
        WORKSPACE_COOKIE_NAME,
        serializeWorkspaceSelection({ kind: "fan", id: fan.workspace_id }),
        workspaceCookieOptions(),
      );
    }

    revalidatePath("/", "layout");
    revalidatePath("/settings/profile");
    revalidatePath(`/people/${completedProfile.handle}`);

    return {
      ok: true,
      data: {
        message: "Your Huddle profile is ready.",
        redirectTo: destination === "home" ? "/" : `/people/${completedProfile.handle}`,
      },
    };
  } catch (error) {
    return profileActionFailure(error, values, previousState);
  }
}

export async function activateFanWorkspaceAction(
  previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  return activateFanWorkspace(previousState, formData, "profile");
}

export async function activateFanOnboardingAction(
  previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  return activateFanWorkspace(previousState, formData, "home");
}

export const saveProfileAction = activateFanWorkspaceAction;
