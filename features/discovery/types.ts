export type DiscoveryEvent = Readonly<{
  id: string;
  title: string;
  host: Readonly<{
    kind: "person" | "venue";
    displayName: string;
    venueSlug: string | null;
    verificationStatus: "unverified" | "verified" | "suspended" | null;
  }>;
  match: Readonly<{
    id: string;
    competitionName: string;
    homeTeamName: string;
    homeTeamTla: string | null;
    homeTeamCrestUrl: string | null;
    awayTeamName: string;
    awayTeamTla: string | null;
    awayTeamCrestUrl: string | null;
  }>;
  startsAt: string;
  endsAt: string;
  placeKind: "home" | "venue" | "public_place";
  locationSummary: string;
  mapPoint: Readonly<{ placeName: string; latitude: number; longitude: number }> | null;
  audience: "public" | "team_followers" | "group" | "friends";
  audienceGroupName: string | null;
  audienceTeamName: string | null;
  attendanceMode: "open_door" | "reservations";
  capacity: number | null;
  approvedAttendeeCount: number;
  remainingCapacity: number | null;
  requiresApproval: boolean;
  matchesFollows: boolean;
}>;

export type DiscoveryPage = Readonly<{
  items: readonly DiscoveryEvent[];
  nextCursor: string | null;
  locationMode: "browser";
  generatedAt: string;
  requiresPrivateCache: boolean;
}>;

export type DiscoveryApiPage = Omit<DiscoveryPage, "requiresPrivateCache">;
