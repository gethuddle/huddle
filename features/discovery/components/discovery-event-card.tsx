import { ArrowRight, MapPin, UsersRound } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJerusalemKickoff } from "@/features/sports/time";
import type { DiscoveryEvent } from "@/features/discovery/types";

export function DiscoveryEventCard({ event }: Readonly<{ event: DiscoveryEvent }>) {
  return (
    <Card className="h-full transition hover:border-court/40 hover:bg-surface-deep">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{event.match.competitionName}</Badge>
          <Badge variant="secondary">{event.audience.replaceAll("_", " ")}</Badge>
          {event.matchesFollows ? <Badge>Matches your follows</Badge> : null}
        </div>
        <CardTitle className="text-xl text-linen">{event.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-semibold text-linen">
            {event.match.homeTeamName} vs {event.match.awayTeamName}
          </p>
          <p className="mt-1 text-sm text-muted-dark">
            {formatJerusalemKickoff(event.startsAt)} · Asia/Jerusalem
          </p>
        </div>
        <div className="space-y-2 text-sm text-muted-dark">
          <p className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {event.cityName} · {event.locationSummary}
          </p>
          <p className="flex items-center gap-2">
            <UsersRound aria-hidden="true" className="size-4 shrink-0" />
            {event.remainingCapacity} of {event.capacity} places remaining
          </p>
        </div>
        <p className="text-sm leading-6 text-muted-dark">
          Hosted by {event.host.displayName}
          {event.host.verificationStatus === null
            ? ""
            : ` · venue ${event.host.verificationStatus}`}
        </p>
        {event.viewerAttendanceStatus === null ? null : (
          <Badge variant="outline">
            Your attendance: {event.viewerAttendanceStatus.replaceAll("_", " ")}
          </Badge>
        )}
      </CardContent>
      <CardFooter className="mt-auto justify-end">
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-court hover:text-court-hover"
          href={`/events/${event.id}`}
        >
          Event details
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
