import { Badge } from "@/components/ui/badge";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";

export function audienceLabel(audience: string): string {
  if (audience === "invite_only") return "Invite only";
  if (audience === "team_followers") return "Team followers";
  return audience.charAt(0).toUpperCase() + audience.slice(1);
}

function placeLabel(placeKind: "home" | "venue" | "public_place"): string {
  if (placeKind === "public_place") return "Public place";
  if (placeKind === "home") return "Protected home";
  return "Venue";
}

export function EventBadges({
  audience,
  audienceTeamName,
  placeKind,
  hostKind,
  attendanceMode,
  capacity,
  approvedAttendeeCount,
  requiresApproval,
  venueVerificationStatus,
}: Readonly<{
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceTeamName: string | null;
  placeKind: "home" | "venue" | "public_place";
  hostKind: "person" | "venue";
  attendanceMode: "open_door" | "reservations";
  capacity: number | null;
  approvedAttendeeCount: number;
  requiresApproval: boolean;
  venueVerificationStatus: "unverified" | "verified" | "suspended" | null;
}>) {
  return (
    <div aria-label="Event facts" className="flex flex-wrap gap-2">
      <Badge variant="secondary">
        {audienceLabel(audience)}
        {audience === "team_followers" && audienceTeamName !== null ? ` · ${audienceTeamName}` : ""}
      </Badge>
      <Badge variant="outline">{placeLabel(placeKind)}</Badge>
      <Badge variant="outline">{hostKind === "venue" ? "Venue-hosted" : "Person-hosted"}</Badge>
      {attendanceMode === "open_door" ? (
        <Badge variant="outline">Open door · no RSVP</Badge>
      ) : (
        <>
          <Badge variant="outline">
            {approvedAttendeeCount} approved · {capacity} capacity
          </Badge>
          <Badge variant="outline">
            {requiresApproval ? "Approval required" : "Immediate join"}
          </Badge>
        </>
      )}
      {venueVerificationStatus === null ? null : (
        <VenueVerificationBadge status={venueVerificationStatus} />
      )}
    </div>
  );
}
