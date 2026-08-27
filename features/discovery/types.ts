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
    awayTeamName: string;
  }>;
  startsAt: string;
  endsAt: string;
  cityName: string;
  placeKind: "home" | "venue" | "public_place";
  locationSummary: string;
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceGroupName: string | null;
  audienceTeamName: string | null;
  capacity: number;
  approvedAttendeeCount: number;
  remainingCapacity: number;
  requiresApproval: boolean;
  viewerAttendanceStatus: "requested" | "approved" | "declined" | "left" | "removed" | null;
  matchesFollows: boolean;
}>;

export type DiscoveryPage = Readonly<{
  items: readonly DiscoveryEvent[];
  nextCursor: string | null;
  locationMode: "browser" | "city";
  generatedAt: string;
  requiresPrivateCache: boolean;
}>;

export type DiscoveryApiPage = Omit<DiscoveryPage, "requiresPrivateCache">;
