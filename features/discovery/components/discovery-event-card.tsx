import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { DiscoveryEvent } from "@/features/discovery/types";
import { formatIsraelKickoff } from "@/features/sports/time";

export function DiscoveryEventCard({
  event,
  returnTo,
}: Readonly<{ event: DiscoveryEvent; returnTo: string }>) {
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
  const href = `/events/${event.id}?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <article className="group grid gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-input sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <h4 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          <Link className="outline-none hover:text-forest focus-visible:text-forest" href={href}>
            {event.title}
          </Link>
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">{formatIsraelKickoff(event.startsAt)}</p>
        <p className="mt-1 text-sm text-muted-foreground">Hosted by {event.host.displayName}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          {event.cityName} · {event.locationSummary}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {joining} <span aria-hidden="true">·</span>{" "}
          <span className={event.attendanceMode === "open_door" ? "text-forest" : "text-sand"}>
            {availability}
          </span>
        </p>
      </div>

      <div className="flex items-end">
        <Button asChild className="min-h-11 w-full rounded-full sm:w-auto" variant="outline">
          <Link href={href}>
            Open event
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
