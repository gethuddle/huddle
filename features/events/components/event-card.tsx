import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { audienceLabel } from "@/features/events/components/event-badges";
import type { EventListItem } from "@/features/events/queries";
import { TeamMark } from "@/features/sports/components/team-initials";
import { formatIsraelKickoff } from "@/features/sports/time";

export function EventCard({
  event,
  returnTo,
}: Readonly<{ event: EventListItem; returnTo?: string | null }>) {
  const href =
    returnTo === undefined || returnTo === null
      ? `/events/${event.id}`
      : `/events/${event.id}?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <Card className="h-full" size="sm">
      <CardHeader>
        <p className="text-xs text-muted-foreground">
          {event.status === "published" ? "Published" : event.status.replaceAll("_", " ")} ·{" "}
          {audienceLabel(event.audience)}
          {event.audienceTeamName === null ? "" : ` · ${event.audienceTeamName}`}
        </p>
        <CardTitle className="mt-2 text-xl text-foreground">
          <Link className="hover:text-forest" href={href}>
            {event.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <TeamMark name={event.match.homeTeamName} size="sm" tla={null} />
          <p className="min-w-0 font-semibold text-foreground">
            {event.match.homeTeamName} vs {event.match.awayTeamName}
          </p>
          <TeamMark name={event.match.awayTeamName} size="sm" tla={null} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{event.match.competitionName}</p>
        <p className="mt-4 text-sm font-semibold text-forest">
          {formatIsraelKickoff(event.startsAt)}
        </p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {event.attendanceMode === "open_door"
            ? "Open door · no RSVP, invitation, or guest list"
            : `${event.approvedAttendeeCount} approved · ${event.capacity} registered-account capacity · ${event.requiresApproval ? "attendance review" : "immediate join"}`}
        </p>
      </CardContent>
    </Card>
  );
}
