"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { privateEventFormSchema, venueEventFormSchema } from "@/features/events/schemas";
import type {
  PrivateEventFormValues,
  PrivateEventMutationState,
  VenueEventFormValues,
  VenueEventMutationState,
} from "@/features/events/state";
import { DomainError, domainErrorFromDatabase, toActionError } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

const mutationRowSchema = z
  .object({
    event_id: z.uuid(),
    status: z.enum(["draft", "pending_group_review", "published"]),
  })
  .strict();

const managedVenueIdentitySchema = z.object({
  venue_id: z.uuid(),
  city_id: z.uuid(),
  verification_status: z.enum(["unverified", "verified", "suspended"]),
  suspended_at: z.string().nullable(),
});

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): PrivateEventFormValues {
  return {
    eventId: formString(formData.get("eventId")),
    organizingGroupId: formString(formData.get("organizingGroupId")),
    matchId: formString(formData.get("matchId")),
    title: formString(formData.get("title")),
    description: formString(formData.get("description")),
    expectedActivity: formString(formData.get("expectedActivity")),
    costDescription: formString(formData.get("costDescription")),
    eventRules: formString(formData.get("eventRules")),
    commercialAffiliation: formString(formData.get("commercialAffiliation")),
    hostPresenceConfirmed: formData.get("hostPresenceConfirmed") === "on",
    cityId: formString(formData.get("cityId")),
    placeKind: formString(formData.get("placeKind")),
    publicPlaceName: formString(formData.get("publicPlaceName")),
    publicAddressText: formString(formData.get("publicAddressText")),
    publicLongitude: formString(formData.get("publicLongitude")),
    publicLatitude: formString(formData.get("publicLatitude")),
    privateAddressText: formString(formData.get("privateAddressText")),
    privateDirections: formString(formData.get("privateDirections")),
    privateLongitude: formString(formData.get("privateLongitude")),
    privateLatitude: formString(formData.get("privateLatitude")),
    audience: formString(formData.get("audience")),
    audienceGroupId: formString(formData.get("audienceGroupId")),
    capacity: formString(formData.get("capacity")),
  };
}

function parsedInput(formData: FormData) {
  return {
    ...submittedValues(formData),
    intent: formData.get("intent"),
  };
}

function failure(
  error: unknown,
  values: PrivateEventFormValues,
  previousState: PrivateEventMutationState,
): PrivateEventMutationState {
  return {
    ok: false,
    error: toActionError(error),
    values: {
      ...values,
      privateAddressText: "",
      privateDirections: "",
      privateLongitude: "",
      privateLatitude: "",
    },
    attempt: previousState?.ok === false ? previousState.attempt + 1 : 1,
  };
}

export async function savePrivateEventAction(
  previousState: PrivateEventMutationState,
  formData: FormData,
): Promise<PrivateEventMutationState> {
  const values = submittedValues(formData);
  const parsed = privateEventFormSchema.safeParse(parsedInput(formData));
  if (!parsed.success) return failure(parsed.error, values, previousState);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor("community"),
      getRequestId(),
    ]);
    const matchResult = await supabase
      .from("public_future_matches")
      .select("starts_at")
      .eq("id", parsed.data.matchId)
      .maybeSingle();
    if (matchResult.error !== null)
      throw new DomainError("INTERNAL_ERROR", { cause: matchResult.error });
    if (matchResult.data?.starts_at === null || matchResult.data?.starts_at === undefined) {
      throw new DomainError("NOT_FOUND");
    }

    const startsAt = new Date(matchResult.data.starts_at);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const home = parsed.data.placeKind === "home";

    const commonEventInput = {
      input_match_id: parsed.data.matchId,
      input_title: parsed.data.title,
      input_description: parsed.data.description,
      input_expected_activity: parsed.data.expectedActivity,
      input_cost_description: parsed.data.costDescription,
      input_event_rules: parsed.data.eventRules,
      input_commercial_affiliation: parsed.data.commercialAffiliation,
      input_host_presence_confirmed: parsed.data.hostPresenceConfirmed,
      input_starts_at: startsAt.toISOString(),
      input_ends_at: endsAt.toISOString(),
      input_city_id: parsed.data.cityId,
      input_place_kind: parsed.data.placeKind,
      input_public_place_name: (home ? null : parsed.data.publicPlaceName) as string,
      input_public_address_text: (home ? null : parsed.data.publicAddressText) as string,
      input_public_longitude: (home ? null : parsed.data.publicLongitude) as number,
      input_public_latitude: (home ? null : parsed.data.publicLatitude) as number,
      input_audience: parsed.data.audience,
      input_audience_group_id: parsed.data.audienceGroupId as string,
      input_capacity: parsed.data.capacity,
      input_private_address_text: (home ? parsed.data.privateAddressText : null) as string,
      input_private_directions: (home ? parsed.data.privateDirections : null) as string,
      input_private_longitude: (home ? parsed.data.privateLongitude : null) as number,
      input_private_latitude: (home ? parsed.data.privateLatitude : null) as number,
      input_intent: parsed.data.intent,
      audit_request_id: requestId,
    };

    if (parsed.data.organizingGroupId !== null && parsed.data.eventId !== null) {
      throw new DomainError("NOT_ALLOWED");
    }

    const { data, error } =
      parsed.data.organizingGroupId === null
        ? await supabase.rpc("create_or_update_event", {
            input_event_id: parsed.data.eventId as string,
            input_host_venue_id: null as unknown as string,
            input_organizing_group_id: parsed.data.audienceGroupId as string,
            input_venue_id: null as unknown as string,
            input_audience_team_id: null as unknown as string,
            input_requires_approval: true,
            ...commonEventInput,
          })
        : await supabase.rpc("create_group_event", {
            input_organizing_group_id: parsed.data.organizingGroupId,
            ...commonEventInput,
          });
    if (error !== null) throw domainErrorFromDatabase(error);

    const event = mutationRowSchema.parse(data.at(0));
    revalidatePath("/events/" + event.event_id);
    revalidatePath("/matches/" + parsed.data.matchId);
    if (parsed.data.organizingGroupId !== null || parsed.data.audienceGroupId !== null) {
      revalidatePath("/groups/[slug]", "page");
      revalidatePath("/groups/[slug]/manage", "page");
    }

    const message =
      event.status === "draft"
        ? "Private event saved as a draft."
        : event.status === "pending_group_review"
          ? "Event submitted to its organizing group for review."
          : "Private event published to its eligible audience.";
    return {
      ok: true,
      data: { message, event: { id: event.event_id, status: event.status } },
    };
  } catch (error) {
    return failure(error, values, previousState);
  }
}

function submittedVenueEventValues(formData: FormData): VenueEventFormValues {
  return {
    eventId: formString(formData.get("eventId")),
    venueId: formString(formData.get("venueId")),
    venueSlug: formString(formData.get("venueSlug")),
    matchId: formString(formData.get("matchId")),
    title: formString(formData.get("title")),
    description: formString(formData.get("description")),
    expectedActivity: formString(formData.get("expectedActivity")),
    costDescription: formString(formData.get("costDescription")),
    eventRules: formString(formData.get("eventRules")),
    commercialAffiliation: formString(formData.get("commercialAffiliation")),
    hostPresenceConfirmed: formData.get("hostPresenceConfirmed") === "on",
    audience: formString(formData.get("audience")),
    audienceTeamId: formString(formData.get("audienceTeamId")),
    capacity: formString(formData.get("capacity")),
    requiresApproval: formData.get("requiresApproval") === "on",
  };
}

function venueEventFailure(
  error: unknown,
  values: VenueEventFormValues,
  previousState: VenueEventMutationState,
): VenueEventMutationState {
  return {
    ok: false,
    error: toActionError(error),
    values,
    attempt: previousState?.ok === false ? previousState.attempt + 1 : 1,
  };
}

export async function saveVenueEventAction(
  previousState: VenueEventMutationState,
  formData: FormData,
): Promise<VenueEventMutationState> {
  const values = submittedVenueEventValues(formData);
  const parsed = venueEventFormSchema.safeParse({
    ...values,
    intent: formData.get("intent"),
  });
  if (!parsed.success) return venueEventFailure(parsed.error, values, previousState);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor("community"),
      getRequestId(),
    ]);
    const [venueResult, matchResult] = await Promise.all([
      supabase.rpc("get_venue_for_management", { lookup_slug: parsed.data.venueSlug }),
      supabase
        .from("public_future_matches")
        .select("starts_at")
        .eq("id", parsed.data.matchId)
        .maybeSingle(),
    ]);
    if (venueResult.error !== null) throw domainErrorFromDatabase(venueResult.error);
    if (matchResult.error !== null) {
      throw new DomainError("INTERNAL_ERROR", { cause: matchResult.error });
    }

    const rawVenue = venueResult.data.at(0);
    if (rawVenue === undefined || matchResult.data?.starts_at == null) {
      throw new DomainError("NOT_FOUND");
    }
    const venue = managedVenueIdentitySchema.parse(rawVenue);
    if (
      venue.venue_id !== parsed.data.venueId ||
      venue.verification_status === "suspended" ||
      venue.suspended_at !== null
    ) {
      throw new DomainError("NOT_ALLOWED");
    }

    const startsAt = new Date(matchResult.data.starts_at);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const { data, error } = await supabase.rpc("create_or_update_event", {
      input_event_id: parsed.data.eventId as string,
      input_host_venue_id: parsed.data.venueId,
      input_organizing_group_id: null as unknown as string,
      input_match_id: parsed.data.matchId,
      input_title: parsed.data.title,
      input_description: parsed.data.description,
      input_expected_activity: parsed.data.expectedActivity,
      input_cost_description: parsed.data.costDescription,
      input_event_rules: parsed.data.eventRules,
      input_commercial_affiliation: parsed.data.commercialAffiliation,
      input_host_presence_confirmed: parsed.data.hostPresenceConfirmed,
      input_starts_at: startsAt.toISOString(),
      input_ends_at: endsAt.toISOString(),
      input_city_id: venue.city_id,
      input_place_kind: "venue",
      input_venue_id: parsed.data.venueId,
      input_public_place_name: null as unknown as string,
      input_public_address_text: null as unknown as string,
      input_public_longitude: null as unknown as number,
      input_public_latitude: null as unknown as number,
      input_audience: parsed.data.audience,
      input_audience_team_id: parsed.data.audienceTeamId as string,
      input_audience_group_id: null as unknown as string,
      input_capacity: parsed.data.capacity,
      input_requires_approval: parsed.data.requiresApproval,
      input_private_address_text: null as unknown as string,
      input_private_directions: null as unknown as string,
      input_private_longitude: null as unknown as number,
      input_private_latitude: null as unknown as number,
      input_intent: parsed.data.intent,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const event = mutationRowSchema.parse(data.at(0));
    if (event.status === "pending_group_review") {
      throw new DomainError("INTERNAL_ERROR");
    }

    revalidatePath("/events/" + event.event_id);
    revalidatePath("/matches/" + parsed.data.matchId);
    revalidatePath("/venues/" + parsed.data.venueSlug);
    revalidatePath("/venues/" + parsed.data.venueSlug + "/manage");

    return {
      ok: true,
      data: {
        message:
          event.status === "draft"
            ? "Venue event saved as a draft."
            : "Venue event published for safe public browsing.",
        event: { id: event.event_id, status: event.status },
      },
    };
  } catch (error) {
    return venueEventFailure(error, values, previousState);
  }
}
