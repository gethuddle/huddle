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
  attendanceMode,
  capacity,
  approvedAttendeeCount,
  requiresApproval,
}: Readonly<{
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceTeamName: string | null;
  placeKind: "home" | "venue" | "public_place";
  attendanceMode: "open_door" | "reservations";
  capacity: number | null;
  approvedAttendeeCount: number;
  requiresApproval: boolean;
}>) {
  const facts = [
    `${audienceLabel(audience)}${
      audience === "team_followers" && audienceTeamName !== null ? ` · ${audienceTeamName}` : ""
    }`,
    placeLabel(placeKind),
    attendanceMode === "open_door"
      ? "Just come along · no RSVP"
      : `${approvedAttendeeCount} of ${capacity} going · ${
          requiresApproval ? "Request to join" : "Join instantly"
        }`,
  ];

  return (
    <div
      aria-label="Event facts"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground"
    >
      {facts.map((fact, index) => (
        <span className="inline-flex items-center gap-3" key={fact}>
          {index === 0 ? null : <span aria-hidden="true">·</span>}
          <span>{fact}</span>
        </span>
      ))}
    </div>
  );
}
