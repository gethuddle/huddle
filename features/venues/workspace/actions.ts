"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import {
  venueSpaceInputSchema,
  venuePlanSchema,
  venueArchiveSchema,
  venueSettingsInputSchema,
  venueWorkspaceActivationSchema,
  venueWorkspaceUpdateSchema,
} from "@/features/venues/workspace/schemas";
import {
  actionFailure,
  actionSuccess,
  type ActionResult,
  DomainError,
  domainErrorFromDatabase,
} from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

const venueMutationRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string(),
    verification_status: z.enum(["unverified", "verified", "suspended"]),
  })
  .strict();

const venueSpaceMutationRowSchema = z
  .object({
    space_id: z.uuid(),
    name: z.string(),
    capacity: z.number().int().positive().nullable(),
    active: z.boolean(),
  })
  .strict();

const venueAddressDefaultsRowSchema = z
  .object({
    address_text: z.string(),
    longitude: z.number(),
    latitude: z.number(),
  })
  .passthrough();

type VenueWorkspaceMutationData = Readonly<{
  message: string;
  venue: Readonly<{
    id: string;
    slug: string;
    verificationStatus: "unverified" | "verified" | "suspended";
  }>;
}>;

type VenueSpaceMutationData = Readonly<{
  message: string;
  space: Readonly<{ id: string; name: string; capacity: number | null; active: boolean }>;
}>;

export type VenueWorkspaceMutationState = ActionResult<VenueWorkspaceMutationData> | null;
export type VenueSpaceMutationState = ActionResult<VenueSpaceMutationData> | null;

type VenuePlanMutationData = Readonly<{
  message: string;
  createdCount: number;
  eventIds: readonly string[];
}>;
export type VenuePlanMutationState = ActionResult<VenuePlanMutationData>;
export type VenueArchiveMutationState = ActionResult<Readonly<{ message: string }>> | null;

function formValue(formData: FormData, name: string): FormDataEntryValue | null {
  return formData.get(name);
}

function sharedVenueInput(formData: FormData) {
  return {
    name: formValue(formData, "name"),
    slug: formValue(formData, "slug"),
    cityId: formValue(formData, "cityId"),
    addressText: formValue(formData, "addressText"),
    longitude: formValue(formData, "longitude"),
    latitude: formValue(formData, "latitude"),
    description: formValue(formData, "description"),
    facilities: formData.getAll("facilities"),
    houseInformation: formValue(formData, "houseInformation"),
    defaultAttendanceMode: formValue(formData, "defaultAttendanceMode"),
    defaultRequiresApproval: formValue(formData, "defaultRequiresApproval"),
  };
}

export async function createVenueWorkspaceAction(
  _previousState: VenueWorkspaceMutationState,
  formData: FormData,
): Promise<VenueWorkspaceMutationState> {
  const parsed = venueWorkspaceActivationSchema.safeParse({
    ...sharedVenueInput(formData),
    mainSpaceName: formValue(formData, "mainSpaceName"),
    mainSpaceCapacity: formValue(formData, "mainSpaceCapacity"),
    adultAttested: formValue(formData, "adultAttested"),
    representationAttested: formValue(formData, "representationAttested"),
    rulesAccepted: formValue(formData, "rulesAccepted"),
    rulesVersion: formValue(formData, "rulesVersion"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor("authenticated"),
      getRequestId(),
    ]);
    const { data, error } = await supabase.rpc("create_venue_workspace_v2", {
      input_name: parsed.data.name,
      input_slug: parsed.data.slug,
      input_city_id: parsed.data.cityId,
      input_address_text: parsed.data.addressText,
      input_longitude: parsed.data.longitude,
      input_latitude: parsed.data.latitude,
      input_description: parsed.data.description,
      input_main_space_name: parsed.data.mainSpaceName,
      input_main_space_capacity: parsed.data.mainSpaceCapacity as number,
      input_default_attendance_mode: parsed.data.defaultAttendanceMode,
      input_facilities: parsed.data.facilities,
      input_house_information: parsed.data.houseInformation,
      input_default_requires_approval: parsed.data.defaultRequiresApproval,
      input_adult_attested: parsed.data.adultAttested,
      input_representation_attested: parsed.data.representationAttested,
      input_rules_version: parsed.data.rulesVersion,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const raw = data.at(0);
    if (raw === undefined) throw new DomainError("INTERNAL_ERROR");
    const row = venueMutationRowSchema.parse(raw);

    revalidatePath("/", "layout");
    revalidatePath(`/venues/${row.slug}`);

    return actionSuccess({
      message: "Venue workspace is ready.",
      venue: {
        id: row.venue_id,
        slug: row.slug,
        verificationStatus: row.verification_status,
      },
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateVenueWorkspaceAction(
  _previousState: VenueWorkspaceMutationState,
  formData: FormData,
): Promise<VenueWorkspaceMutationState> {
  const parsed = venueWorkspaceUpdateSchema.safeParse({
    venueId: formValue(formData, "venueId"),
    ...sharedVenueInput(formData),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor({ venueId: parsed.data.venueId }),
      getRequestId(),
    ]);
    const { data, error } = await supabase.rpc("update_venue_workspace_v2", {
      input_venue_id: parsed.data.venueId,
      input_name: parsed.data.name,
      input_slug: parsed.data.slug,
      input_city_id: parsed.data.cityId,
      input_address_text: parsed.data.addressText,
      input_longitude: parsed.data.longitude,
      input_latitude: parsed.data.latitude,
      input_description: parsed.data.description,
      input_facilities: parsed.data.facilities,
      input_house_information: parsed.data.houseInformation,
      input_default_attendance_mode: parsed.data.defaultAttendanceMode,
      input_default_requires_approval: parsed.data.defaultRequiresApproval,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const raw = data.at(0);
    if (raw === undefined) throw new DomainError("INTERNAL_ERROR");
    const row = venueMutationRowSchema.parse(raw);

    revalidatePath(`/venues/${row.slug}`);
    revalidatePath(`/venues/${row.slug}/workspace`, "layout");

    return actionSuccess({
      message: "Venue workspace updated.",
      venue: {
        id: row.venue_id,
        slug: row.slug,
        verificationStatus: row.verification_status,
      },
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveVenueSpaceAction(
  _previousState: VenueSpaceMutationState,
  formData: FormData,
): Promise<VenueSpaceMutationState> {
  const parsed = venueSpaceInputSchema.safeParse({
    venueId: formValue(formData, "venueId"),
    spaceId: formValue(formData, "spaceId"),
    name: formValue(formData, "name"),
    capacity: formValue(formData, "capacity"),
    active: formValue(formData, "active"),
    sortOrder: formValue(formData, "sortOrder"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor({ venueId: parsed.data.venueId }),
      getRequestId(),
    ]);
    const { data, error } = await supabase.rpc("save_venue_space", {
      input_venue_id: parsed.data.venueId,
      // Generated RPC types do not preserve nullable SQL scalar arguments.
      input_space_id: parsed.data.spaceId as string,
      input_name: parsed.data.name,
      input_capacity: parsed.data.capacity as number,
      input_active: parsed.data.active,
      input_sort_order: parsed.data.sortOrder,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const raw = data.at(0);
    if (raw === undefined) throw new DomainError("INTERNAL_ERROR");
    const row = venueSpaceMutationRowSchema.parse(raw);

    revalidatePath("/venues/[slug]/workspace", "layout");
    return actionSuccess({
      message: "Venue area saved.",
      space: {
        id: row.space_id,
        name: row.name,
        capacity: row.capacity,
        active: row.active,
      },
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function planVenueEventsAction(input: unknown): Promise<VenuePlanMutationState> {
  const parsed = venuePlanSchema.safeParse(input);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor({ venueId: parsed.data.venueId }),
      getRequestId(),
    ]);
    const { data, error } = await supabase.rpc("plan_venue_events", {
      input_items: parsed.data.items,
      input_intent: parsed.data.intent,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const rows = z
      .array(
        z
          .object({
            event_id: z.uuid(),
            status: z.enum(["draft", "published"]),
          })
          .strict(),
      )
      .length(parsed.data.items.length)
      .parse(data);

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath(`/venues/${parsed.data.venueSlug}`);
    revalidatePath(`/venues/${parsed.data.venueSlug}/workspace`, "layout");
    for (const row of rows) revalidatePath(`/events/${row.event_id}`);

    return actionSuccess({
      message:
        parsed.data.intent === "draft"
          ? `${rows.length} event${rows.length === 1 ? "" : "s"} saved as drafts.`
          : `${rows.length} event${rows.length === 1 ? "" : "s"} published.`,
      createdCount: rows.length,
      eventIds: rows.map((row) => row.event_id),
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateVenueSettingsAction(
  input: unknown,
): Promise<VenueWorkspaceMutationState> {
  const parsed = venueSettingsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor({ venueId: parsed.data.venueId }),
      getRequestId(),
    ]);
    const currentResult = await supabase.rpc("get_venue_settings", {
      input_venue_id: parsed.data.venueId,
    });
    if (currentResult.error !== null) throw domainErrorFromDatabase(currentResult.error);
    const currentRaw = currentResult.data.at(0);
    if (currentRaw === undefined) throw new DomainError("NOT_FOUND");
    const current = venueAddressDefaultsRowSchema.parse(currentRaw);
    const address = parsed.data.address;
    const { data, error } = await supabase.rpc("update_venue_workspace_v2", {
      input_venue_id: parsed.data.venueId,
      input_name: parsed.data.name,
      input_slug: parsed.data.slug,
      input_city_id: parsed.data.cityId,
      input_address_text: address?.label ?? current.address_text,
      input_longitude: address?.longitude ?? current.longitude,
      input_latitude: address?.latitude ?? current.latitude,
      input_description: parsed.data.description,
      input_facilities: parsed.data.facilities,
      input_house_information: parsed.data.houseInformation,
      input_default_attendance_mode: parsed.data.defaultAttendanceMode,
      input_default_requires_approval: parsed.data.defaultRequiresApproval,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const raw = data.at(0);
    if (raw === undefined) throw new DomainError("INTERNAL_ERROR");
    const row = venueMutationRowSchema.parse(raw);
    revalidatePath(`/venues/${row.slug}`);
    revalidatePath(`/venues/${row.slug}/workspace`, "layout");
    return actionSuccess({
      message: "Venue profile and defaults updated.",
      venue: {
        id: row.venue_id,
        slug: row.slug,
        verificationStatus: row.verification_status,
      },
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function archiveVenueAction(
  _previousState: VenueArchiveMutationState,
  input: unknown,
): Promise<VenueArchiveMutationState> {
  const parsed = venueArchiveSchema.safeParse(input);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor({ venueId: parsed.data.venueId }),
      getRequestId(),
    ]);
    const { error } = await supabase.rpc("archive_venue", {
      input_venue_id: parsed.data.venueId,
      input_confirmation: parsed.data.confirmation,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    revalidatePath("/", "layout");
    revalidatePath("/dashboard");
    revalidatePath(`/venues/${parsed.data.venueSlug}`);
    return actionSuccess({
      message: "Venue closed. Future events were cancelled and history was retained.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}
