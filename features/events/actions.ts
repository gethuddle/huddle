"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import {
  discardEventDraft,
  finalizeEventDraft,
  getEventDraft,
  saveEventDraft,
} from "@/features/events/drafts";
import {
  eventDraftIdInputSchema,
  eventDraftSaveInputSchema,
  privateEventFormSchema,
  venueEventFormSchema,
  venueEventEditValuesSchema,
} from "@/features/events/schemas";
import type {
  EventDraftActionData,
  EventDraftActionState,
  EventDraftDiscardActionState,
  EventDraftFinalizeActionState,
  PrivateEventFormValues,
  PrivateEventMutationState,
  VenueEventFormValues,
  VenueEventMutationState,
} from "@/features/events/state";
import {
  actionFailure,
  actionSuccess,
  DomainError,
  domainErrorFromDatabase,
  toActionError,
} from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

const mutationRowSchema = z
  .object({
    event_id: z.uuid(),
    status: z.enum(["draft", "pending_group_review", "published"]),
  })
  .strict();

const managedVenueIdentitySchema = z.object({
  venue_id: z.uuid(),
  verification_status: z.enum(["unverified", "verified", "suspended"]),
  suspended_at: z.string().nullable(),
});

function toSafeDraftActionData(
  record: Awaited<ReturnType<typeof getEventDraft>>,
): EventDraftActionData {
  return {
    draft: record.draft,
    organizingGroupId: record.organizingGroupId,
    protectedLocation: record.protectedLocation,
  };
}

export async function saveEventDraftStepAction(rawInput: unknown): Promise<EventDraftActionState> {
  const parsed = eventDraftSaveInputSchema.safeParse(rawInput);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const { supabase } = await requireActor("fan");
    const draft = await saveEventDraft(supabase, parsed.data);
    revalidatePath("/events/drafts");
    return actionSuccess(toSafeDraftActionData(draft));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function loadEventDraftAction(rawInput: unknown): Promise<EventDraftActionState> {
  const parsed = eventDraftIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const { supabase } = await requireActor("authenticated");
    return actionSuccess(toSafeDraftActionData(await getEventDraft(supabase, parsed.data.draftId)));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function discardEventDraftAction(
  rawInput: unknown,
): Promise<EventDraftDiscardActionState> {
  const parsed = eventDraftIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const { supabase } = await requireActor("authenticated");
    await discardEventDraft(supabase, parsed.data.draftId);
    revalidatePath("/events/drafts");
    return actionSuccess({ message: "Draft discarded." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function finalizeEventDraftAction(
  rawInput: unknown,
): Promise<EventDraftFinalizeActionState> {
  const parsed = eventDraftIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return actionFailure(parsed.error);

  let event;
  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    event = await finalizeEventDraft(supabase, parsed.data.draftId, requestId);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/events");
  revalidatePath("/events/drafts");
  revalidatePath(`/events/${event.id}`);
  revalidatePath("/discover");
  redirect(`/events/${event.id}?created=1`);
}

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
  if (
    parsed.data.eventId !== null &&
    (parsed.data.organizingGroupId !== null || parsed.data.audience === "group")
  ) {
    return failure(new DomainError("NOT_ALLOWED"), values, previousState);
  }

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
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

    const effectiveOrganizingGroupId =
      parsed.data.organizingGroupId ??
      (parsed.data.audience === "group" ? parsed.data.audienceGroupId : null);

    const { data, error } =
      effectiveOrganizingGroupId === null
        ? await supabase.rpc("create_or_update_event", {
            input_event_id: parsed.data.eventId as string,
            input_host_venue_id: null as unknown as string,
            input_organizing_group_id: null as unknown as string,
            input_venue_id: null as unknown as string,
            input_audience_team_id: null as unknown as string,
            input_requires_approval: true,
            ...commonEventInput,
          })
        : await supabase.rpc("create_group_event", {
            input_organizing_group_id: effectiveOrganizingGroupId,
            ...commonEventInput,
          });
    if (error !== null) throw domainErrorFromDatabase(error);

    const event = mutationRowSchema.parse(data.at(0));
    revalidatePath("/events/" + event.event_id);
    revalidatePath("/matches/" + parsed.data.matchId);
    if (effectiveOrganizingGroupId !== null || parsed.data.audienceGroupId !== null) {
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
  if (values.eventId !== "") {
    try {
      const identity = z
        .object({
          eventId: z.uuid(),
          venueId: z.uuid(),
          venueSlug: venueEventFormSchema.shape.venueSlug,
          intent: z.enum(["draft", "publish", "cancel"]),
        })
        .parse({
          eventId: values.eventId,
          venueId: values.venueId,
          venueSlug: values.venueSlug,
          intent: formData.get("intent"),
        });
      const inputValues =
        identity.intent === "cancel"
          ? {}
          : venueEventEditValuesSchema.parse({
              title: values.title,
              description: values.description,
              expectedActivity: values.expectedActivity,
              costDescription: values.costDescription,
              eventRules: values.eventRules,
              commercialAffiliation: values.commercialAffiliation,
              hostPresenceConfirmed: values.hostPresenceConfirmed,
              capacity: values.capacity,
              requiresApproval: values.requiresApproval,
            });
      const [{ supabase }, requestId] = await Promise.all([
        requireActor({ venueId: identity.venueId }),
        getRequestId(),
      ]);
      const { data, error } = await supabase.rpc("save_venue_event", {
        input_event_id: identity.eventId,
        input_values: inputValues,
        input_intent: identity.intent,
        audit_request_id: requestId,
      });
      if (error !== null) throw domainErrorFromDatabase(error);
      const event = z
        .object({ event_id: z.uuid(), status: z.enum(["draft", "published", "cancelled"]) })
        .strict()
        .parse(data.at(0));
      revalidatePath(`/events/${event.event_id}`);
      revalidatePath(`/events/${event.event_id}/manage`);
      revalidatePath(`/venues/${identity.venueSlug}/workspace`, "layout");
      revalidatePath(`/venues/${identity.venueSlug}`);
      revalidatePath("/discover");
      return {
        ok: true,
        data: {
          message:
            event.status === "cancelled"
              ? "Draft cancelled. Its history is retained."
              : event.status === "draft"
                ? "Venue draft saved."
                : "Venue event published.",
          event: { id: event.event_id, status: event.status },
        },
      };
    } catch (error) {
      return venueEventFailure(error, values, previousState);
    }
  }
  const parsed = venueEventFormSchema.safeParse({
    ...values,
    intent: formData.get("intent"),
  });
  if (!parsed.success) return venueEventFailure(parsed.error, values, previousState);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor({ venueId: parsed.data.venueId }),
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
