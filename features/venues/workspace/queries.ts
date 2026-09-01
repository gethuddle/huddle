import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import type {
  VenueCalendarEntry,
  VenueFacility,
  VenueSettings,
  VenueTodayEvent,
  VenueTodaySnapshot,
  VenueWorkspace,
} from "./types";

export function filterUpcomingVenueCalendar(
  calendar: readonly VenueCalendarEntry[],
  nowMilliseconds: number,
): readonly VenueCalendarEntry[] {
  return calendar.filter(
    (event) =>
      Date.parse(event.endsAt) >= nowMilliseconds &&
      event.status !== "cancelled" &&
      event.status !== "completed",
  );
}

const venueSpaceRowSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    capacity: z.number().int().positive().nullable(),
    active: z.boolean(),
  })
  .strict();

const venueWorkspaceRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    role: z.enum(["owner", "admin"]),
    verification_status: z.enum(["unverified", "verified", "suspended"]),
    needs_area_setup: z.boolean(),
    needs_capacity: z.boolean(),
    spaces: z.array(venueSpaceRowSchema),
  })
  .strict();

const venueCalendarRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
    starts_at: z.string(),
    ends_at: z.string(),
    venue_space_id: z.uuid().nullable(),
    venue_space_name: z.string().nullable(),
    attendance_mode: z.enum(["open_door", "reservations"]),
    capacity: z.number().int().positive().nullable(),
    approved_attendee_count: z.number().int().nonnegative(),
    requires_approval: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.venue_space_id === null) !== (value.venue_space_name === null)) {
      context.addIssue({ code: "custom", message: "Venue area identity is incomplete." });
    }
  });

const venueFacilitySchema = z.enum([
  "wheelchair_accessible",
  "step_free_access",
  "accessible_toilet",
  "hearing_loop",
  "parking",
  "food",
  "drinks",
]);

const venueSettingsRowSchema = z
  .object({
    venue_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    role: z.enum(["owner", "admin"]),
    verification_status: z.enum(["unverified", "verified", "suspended"]),
    address_text: z.string(),
    longitude: z.number(),
    latitude: z.number(),
    description: z.string(),
    facilities: z.array(venueFacilitySchema),
    house_information: z.string(),
    default_attendance_mode: z.enum(["open_door", "reservations"]),
    default_requires_approval: z.boolean(),
    spaces: z.array(venueSpaceRowSchema),
  })
  .strict();

const venueTodayEventRowSchema = venueCalendarRowSchema.safeExtend({
  waiting_attendee_count: z.number().int().nonnegative(),
});
const venueAttentionRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    waiting_count: z.number().int().positive(),
  })
  .strict();
const venueTodayRowSchema = z
  .object({
    next_event: venueTodayEventRowSchema.nullable(),
    today_events: z.array(venueTodayEventRowSchema),
    attention: z.array(venueAttentionRowSchema),
    setup_tasks: z.array(z.string()),
  })
  .strict();

function mapTodayEvent(row: z.infer<typeof venueTodayEventRowSchema>): VenueTodayEvent {
  return {
    id: row.event_id,
    title: row.title,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueSpace:
      row.venue_space_id === null || row.venue_space_name === null
        ? null
        : { id: row.venue_space_id, name: row.venue_space_name },
    attendanceMode: row.attendance_mode,
    capacity: row.capacity,
    approvedAttendeeCount: row.approved_attendee_count,
    waitingAttendeeCount: row.waiting_attendee_count,
    requiresApproval: row.requires_approval,
  };
}

export async function getVenueWorkspace(venueId: string): Promise<VenueWorkspace | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_venue_workspace", {
    input_venue_id: venueId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  const raw = data.at(0);
  if (raw === undefined) return null;

  try {
    const row = venueWorkspaceRowSchema.parse(raw);
    return {
      id: row.venue_id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      verificationStatus: row.verification_status,
      needsAreaSetup: row.needs_area_setup,
      spaces: row.spaces,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function listVenueCalendar(
  venueId: string,
  limit = 100,
): Promise<readonly VenueCalendarEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_venue_calendar", {
    input_venue_id: venueId,
    input_limit: Math.min(Math.max(limit, 1), 250),
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  try {
    return z
      .array(venueCalendarRowSchema)
      .parse(data)
      .map((row) => ({
        id: row.event_id,
        title: row.title,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        venueSpace:
          row.venue_space_id === null || row.venue_space_name === null
            ? null
            : { id: row.venue_space_id, name: row.venue_space_name },
        attendanceMode: row.attendance_mode,
        capacity: row.capacity,
        approvedAttendeeCount: row.approved_attendee_count,
        requiresApproval: row.requires_approval,
      }));
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function listUpcomingVenueCalendar(
  venueId: string,
  limit = 250,
): Promise<readonly VenueCalendarEntry[]> {
  return filterUpcomingVenueCalendar(await listVenueCalendar(venueId, limit), Date.now());
}

export async function getVenueSettings(venueId: string): Promise<VenueSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_venue_settings", {
    input_venue_id: venueId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  const raw = data.at(0);
  if (raw === undefined) return null;

  try {
    const row = venueSettingsRowSchema.parse(raw);
    return {
      id: row.venue_id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      verificationStatus: row.verification_status,
      addressText: row.address_text,
      longitude: row.longitude,
      latitude: row.latitude,
      description: row.description,
      facilities: row.facilities as readonly VenueFacility[],
      houseInformation: row.house_information,
      defaultAttendanceMode: row.default_attendance_mode,
      defaultRequiresApproval: row.default_requires_approval,
      spaces: row.spaces,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function getVenueToday(venueId: string, limit = 12): Promise<VenueTodaySnapshot> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_venue_today", {
    input_venue_id: venueId,
    input_limit: Math.min(Math.max(limit, 1), 30),
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  try {
    const row = venueTodayRowSchema.parse(data.at(0));
    return {
      nextEvent: row.next_event === null ? null : mapTodayEvent(row.next_event),
      todayEvents: row.today_events.map(mapTodayEvent),
      attention: row.attention.map((item) => ({
        eventId: item.event_id,
        title: item.title,
        waitingCount: item.waiting_count,
      })),
      setupTasks: row.setup_tasks,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}
