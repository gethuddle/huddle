export type VenueSpace = Readonly<{
  id: string;
  name: string;
  capacity: number | null;
  active: boolean;
}>;

export type VenueWorkspace = Readonly<{
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin";
  verificationStatus: "unverified" | "verified" | "suspended";
  needsAreaSetup: boolean;
  spaces: readonly VenueSpace[];
}>;

export type VenueCalendarEntry = Readonly<{
  id: string;
  title: string;
  status: "draft" | "pending_group_review" | "published" | "cancelled" | "completed";
  startsAt: string;
  endsAt: string;
  venueSpace: Readonly<{ id: string; name: string }> | null;
  attendanceMode: "open_door" | "reservations";
  capacity: number | null;
  approvedAttendeeCount: number;
  requiresApproval: boolean;
}>;

export type VenueTodayEvent = VenueCalendarEntry &
  Readonly<{
    waitingAttendeeCount: number;
  }>;

export type VenueTodaySnapshot = Readonly<{
  nextEvent: VenueTodayEvent | null;
  todayEvents: readonly VenueTodayEvent[];
  attention: readonly Readonly<{
    eventId: string;
    title: string;
    waitingCount: number;
  }>[];
  setupTasks: readonly string[];
}>;

export type VenueFacility =
  | "wheelchair_accessible"
  | "step_free_access"
  | "accessible_toilet"
  | "hearing_loop"
  | "parking"
  | "food"
  | "drinks";

export type VenueSettings = Readonly<{
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin";
  verificationStatus: "unverified" | "verified" | "suspended";
  addressText: string;
  longitude: number;
  latitude: number;
  description: string;
  facilities: readonly VenueFacility[];
  houseInformation: string;
  defaultRequiresApproval: boolean;
  defaultAttendanceMode: "open_door" | "reservations";
  spaces: readonly VenueSpace[];
}>;

export type VenuePlanItem = Readonly<{
  matchId: string;
  venueSpaceId: string;
  attendanceMode: "open_door" | "reservations";
  title: string | null;
  description: string | null;
  capacity: number | null;
  requiresApproval: boolean | null;
}>;
