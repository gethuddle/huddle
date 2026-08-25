"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/features/auth/actor";
import { profileInputSchema } from "@/features/profiles/schemas";
import type { ProfileActionState, ProfileFormValues } from "@/features/profiles/state";
import { domainErrorFromDatabase, DomainError, toActionError } from "@/lib/errors";

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): ProfileFormValues {
  return {
    handle: formString(formData.get("handle")),
    displayName: formString(formData.get("displayName")),
    citySlug: formString(formData.get("citySlug")),
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

export async function saveProfileAction(
  previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const values = submittedValues(formData);
  const parsed = profileInputSchema.safeParse({
    handle: formData.get("handle"),
    displayName: formData.get("displayName"),
    citySlug: formData.get("citySlug"),
    bio: formData.get("bio"),
    adultAttested: formData.get("adultAttested"),
    rulesAccepted: formData.get("rulesAccepted"),
    rulesVersion: formData.get("rulesVersion"),
  });

  if (!parsed.success) {
    return profileActionFailure(parsed.error, values, previousState);
  }

  try {
    const { supabase } = await requireActor("onboarding");
    const { data, error } = await supabase.rpc("complete_profile", {
      input_handle: parsed.data.handle,
      input_display_name: parsed.data.displayName,
      input_city_slug: parsed.data.citySlug,
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

    revalidatePath("/", "layout");
    revalidatePath("/settings/profile");
    revalidatePath(`/people/${completedProfile.handle}`);

    return {
      ok: true,
      data: {
        message: "Your Huddle profile is ready.",
        redirectTo: `/people/${completedProfile.handle}`,
      },
    };
  } catch (error) {
    return profileActionFailure(error, values, previousState);
  }
}
