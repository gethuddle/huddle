import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { DiscoveryEvent } from "@/features/discovery/types";
import { formatIsraelKickoff } from "@/features/sports/time";

export function DiscoveryEventCard({ event }: Readonly<{ event: DiscoveryEvent }>) {
  const joining =
    event.attendanceMode === "open_door"
      ? "Open door · no reservation"
      : event.requiresApproval
        ? "Request to join"
        : "Join instantly";
  const availability =
    event.attendanceMode === "open_door"
      ? "Just come along"
      : `${event.remainingCapacity} place${event.remainingCapacity === 1 ? "" : "s"} left`;

  return (
    <article className="group grid gap-4 rounded-3xl border border-border-dark bg-surface-raised p-3 transition hover:border-border-strong sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-stretch sm:gap-5 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:bg-transparent sm:p-0 sm:pb-5">
      <div className="relative flex min-h-32 items-center justify-center overflow-hidden rounded-2xl border border-border-dark bg-[radial-gradient(circle_at_25%_20%,rgba(44,224,123,0.18),transparent_38%),linear-gradient(145deg,#16241c,#0e1512)] sm:min-h-36">
        <span className="text-center text-2xl font-semibold tracking-[-0.05em] text-linen/70">
          {initials(event.match.homeTeamName)}
          <span className="mx-2 text-court">·</span>
          {initials(event.match.awayTeamName)}
        </span>
        <span className="absolute bottom-3 left-3 rounded-full border border-border-strong bg-surface-deep/90 px-3 py-1 text-xs font-semibold text-linen">
          {event.match.competitionName}
        </span>
      </div>

      <div className="min-w-0 py-1">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-linen">
          <Link
            className="outline-none hover:text-court focus-visible:text-court"
            href={`/events/${event.id}`}
          >
            {event.match.homeTeamName} vs {event.match.awayTeamName}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-muted-dark">{formatIsraelKickoff(event.startsAt)}</p>
        <p className="mt-3 font-medium text-linen">{event.title}</p>
        <p className="mt-1 text-sm text-muted-dark">Hosted by {event.host.displayName}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-dark">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          {event.cityName} · {event.locationSummary}
        </p>
        <p className="mt-3 text-sm text-muted-dark">
          {joining} <span aria-hidden="true">·</span>{" "}
          <span className={event.attendanceMode === "open_door" ? "text-court" : "text-sand"}>
            {availability}
          </span>
        </p>
      </div>

      <div className="flex items-end sm:pb-1">
        <Button asChild className="min-h-11 w-full rounded-full sm:w-auto" variant="outline">
          <Link href={`/events/${event.id}`}>
            Open event
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function initials(label: string) {
  return label
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
