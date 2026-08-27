import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { audienceLabel } from "@/features/events/components/event-badges";
import type { EventListItem } from "@/features/events/queries";
import { formatJerusalemKickoff } from "@/features/sports/time";

export function EventCard({ event }: Readonly<{ event: EventListItem }>) {
  return (
    <Card className="h-full" size="sm">
      <CardHeader>
        <div className="flex flex-wrap gap-2">
          <Badge variant={event.status === "published" ? "secondary" : "outline"}>
            {event.status.replaceAll("_", " ")}
          </Badge>
          <Badge variant="outline">
            {audienceLabel(event.audience)}
            {event.audienceTeamName === null ? "" : ` · ${event.audienceTeamName}`}
          </Badge>
        </div>
        <CardTitle className="mt-3 text-xl text-linen">
          <Link className="hover:text-court" href={`/events/${event.id}`}>
            {event.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-linen">
          {event.match.homeTeamName} vs {event.match.awayTeamName}
        </p>
        <p className="mt-2 text-sm text-muted-dark">{event.match.competitionName}</p>
        <p className="mt-4 text-sm font-semibold text-court">
          {formatJerusalemKickoff(event.startsAt)}
        </p>
        <p className="mt-3 text-xs leading-5 text-muted-dark">
          {event.approvedAttendeeCount} approved · {event.capacity} registered-account capacity ·{" "}
          {event.requiresApproval ? "attendance review" : "immediate join"}
        </p>
      </CardContent>
    </Card>
  );
}
