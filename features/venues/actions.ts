"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { venueFollowSchema, venueFormSchema } from "@/features/venues/schemas";
import type {
  VenueFollowActionState,
  VenueFormValues,
  VenueMutationState,
} from "@/features/venues/state";
import {
  createVenueWorkspaceAction as activateVenueWorkspaceAction,
  saveVenueSpaceAction,
  updateVenueWorkspaceAction,
} from "@/features/venues/workspace/actions";
import {
  actionFailure,
  actionSuccess,
  DomainError,
  domainErrorFromDatabase,
  toActionError,
} from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

const venueMutationRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string(),
    verification_status: z.enum(["unverified", "verified", "suspended"]),
  })
  .strict();

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function submittedVenueValues(formData: FormData): VenueFormValues {
  return {
    venueId: formString(formData.get("venueId")),
    name: formString(formData.get("name")),
    slug: formString(formData.get("slug")),
    cityId: formString(formData.get("cityId")),
    addressText: formString(formData.get("addressText")),
    longitude: formString(formData.get("longitude")),
    latitude: formString(formData.get("latitude")),
    description: formString(formData.get("description")),
    screenCount: formString(formData.get("screenCount")),
    statedCapacity: formString(formData.get("statedCapacity")),
  };
}

function venueInput(formData: FormData) {
  return {
    venueId: formData.get("venueId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    cityId: formData.get("cityId"),
    addressText: formData.get("addressText"),
    longitude: formData.get("longitude"),
    latitude: formData.get("latitude"),
    description: formData.get("description"),
    screenCount: formData.get("screenCount"),
    statedCapacity: formData.get("statedCapacity"),
  };
}

function venueFailure(
  error: unknown,
  values: VenueFormValues,
  previousState: VenueMutationState,
): VenueMutationState {
  return {
    ok: false,
    error: toActionError(error),
    values,
    attempt: previousState?.ok === false ? previousState.attempt + 1 : 1,
  };
}

async function mutateVenue(
  mode: "create" | "update",
  previousState: VenueMutationState,
  formData: FormData,
): Promise<VenueMutationState> {
  const values = submittedVenueValues(formData);
  const parsed = venueFormSchema.safeParse(venueInput(formData));
  if (!parsed.success) return venueFailure(parsed.error, values, previousState);

  if (mode === "create" && parsed.data.venueId !== null) {
    return venueFailure(new DomainError("VALIDATION_FAILED"), values, previousState);
  }
  if (mode === "update" && parsed.data.venueId === null) {
    return venueFailure(new DomainError("VALIDATION_FAILED"), values, previousState);
  }

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor(mode === "create" ? "common" : { venueId: parsed.data.venueId as string }),
      getRequestId(),
    ]);
    const sharedArgs = {
      input_name: parsed.data.name,
      input_slug: parsed.data.slug,
      input_city_id: parsed.data.cityId,
      input_address_text: parsed.data.addressText,
      input_longitude: parsed.data.longitude,
      input_latitude: parsed.data.latitude,
      input_description: parsed.data.description,
      // Generated RPC types do not preserve nullable SQL scalar arguments.
      input_screen_count: parsed.data.screenCount as number,
      input_stated_capacity: parsed.data.statedCapacity as number,
      audit_request_id: requestId,
    };
    const result =
      mode === "create"
        ? await supabase.rpc("create_venue", sharedArgs)
        : await supabase.rpc("update_venue", {
            ...sharedArgs,
            input_venue_id: parsed.data.venueId as string,
          });

    if (result.error !== null) throw domainErrorFromDatabase(result.error);
    const row = venueMutationRowSchema.parse(result.data.at(0));

    revalidatePath(`/venues/${row.slug}`);
    revalidatePath(`/venues/${row.slug}/manage`);

    return {
      ok: true,
      data: {
        message:
          mode === "create" ? "Venue created as visibly unverified." : "Venue details updated.",
        venue: {
          id: row.venue_id,
          slug: row.slug,
          verificationStatus: row.verification_status,
        },
      },
    };
  } catch (error) {
    return venueFailure(error, values, previousState);
  }
}

export async function createVenueAction(
  previousState: VenueMutationState,
  formData: FormData,
): Promise<VenueMutationState> {
  const result = await activateVenueWorkspaceAction(null, formData);
  if (result?.ok === true) return result;
  if (result?.ok === false) {
    return {
      ...result,
      values: submittedVenueValues(formData),
      attempt: previousState?.ok === false ? previousState.attempt + 1 : 1,
    };
  }
  return venueFailure(
    new DomainError("INTERNAL_ERROR"),
    submittedVenueValues(formData),
    previousState,
  );
}

export async function updateVenueAction(
  previousState: VenueMutationState,
  formData: FormData,
): Promise<VenueMutationState> {
  return mutateVenue("update", previousState, formData);
}

type DatabaseError = Readonly<{ code?: unknown }>;

function databaseCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as DatabaseError).code;
  return typeof code === "string" ? code : null;
}

export async function setVenueFollowAction(
  _previousState: VenueFollowActionState,
  formData: FormData,
): Promise<VenueFollowActionState> {
  const parsed = venueFollowSchema.safeParse({
    venueId: formData.get("venueId"),
    venueSlug: formData.get("venueSlug"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const { supabase, user } = await requireActor("fan");

    if (parsed.data.intent === "follow") {
      const { error } = await supabase.from("venue_follows").insert({
        user_id: user.id,
        venue_id: parsed.data.venueId,
      });

      if (error !== null && databaseCode(error) !== "23505") {
        if (databaseCode(error) === "23503") throw new DomainError("NOT_FOUND", { cause: error });
        if (databaseCode(error) === "42501") {
          throw new DomainError("NOT_ALLOWED", { cause: error });
        }
        throw new DomainError("INTERNAL_ERROR", { cause: error });
      }
    } else {
      const { error } = await supabase
        .from("venue_follows")
        .delete()
        .match({ user_id: user.id, venue_id: parsed.data.venueId });
      if (error !== null) {
        if (databaseCode(error) === "42501") {
          throw new DomainError("NOT_ALLOWED", { cause: error });
        }
        throw new DomainError("INTERNAL_ERROR", { cause: error });
      }
    }

    revalidatePath(`/venues/${parsed.data.venueSlug}`);
    return actionSuccess({
      message: parsed.data.intent === "follow" ? "Venue followed." : "Venue unfollowed.",
      intent: parsed.data.intent,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export {
  activateVenueWorkspaceAction as createVenueWorkspaceAction,
  saveVenueSpaceAction,
  updateVenueWorkspaceAction,
};
