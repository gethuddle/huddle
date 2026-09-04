"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VenueCalendarEntry } from "@/features/venues/workspace/types";
import { cn } from "@/lib/utils";
import { venueEventHref } from "@/features/venues/workspace/event-links";

const FILTERS = ["Draft", "Published", "Full", "Cancelled", "Completed"] as const;
type CalendarFilter = (typeof FILTERS)[number];

function statusFor(event: VenueCalendarEntry): CalendarFilter {
  if (
    event.attendanceMode === "reservations" &&
    event.status === "published" &&
    event.capacity !== null &&
    event.approvedAttendeeCount >= event.capacity
  )
    return "Full";
  if (event.status === "draft") return "Draft";
  if (event.status === "cancelled") return "Cancelled";
  if (event.status === "completed") return "Completed";
  return "Published";
}

function israelDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date(value))
    .replace("Sept", "Sep");
}

function israelTime(value: string) {
  return new Intl.DateTimeFormat("en-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function VenueCalendar({
  events,
  surface = "calendar",
  slug,
}: Readonly<{
  events: readonly VenueCalendarEntry[];
  surface?: "calendar" | "events";
  slug?: string;
}>) {
  const [view, setView] = useState<"agenda" | "month">("agenda");
  const [filter, setFilter] = useState<CalendarFilter | null>(null);
  const visible = useMemo(
    () => events.filter((event) => filter === null || statusFor(event) === filter),
    [events, filter],
  );
  const groups = useMemo(() => {
    const result = new Map<string, VenueCalendarEntry[]>();
    for (const event of visible) {
      const day = israelDate(event.startsAt);
      result.set(day, [...(result.get(day) ?? []), event]);
    }
    return [...result.entries()];
  }, [visible]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {surface === "calendar" ? (
          <div
            aria-label="Calendar view"
            className="inline-flex rounded-full border border-border p-1"
            role="tablist"
          >
            {(["agenda", "month"] as const).map((candidate) => (
              <button
                aria-selected={view === candidate}
                className={cn(
                  "min-h-11 rounded-full px-5 text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  view === candidate
                    ? "bg-court text-ink"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={candidate}
                onClick={() => setView(candidate)}
                role="tab"
                type="button"
              >
                {candidate === "agenda" ? "Agenda" : "Month"}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-foreground">All venue events</p>
        )}
        <div aria-label="Event status" className="flex flex-wrap gap-2">
          {FILTERS.map((candidate) => (
            <Button
              aria-pressed={filter === candidate}
              key={candidate}
              onClick={() => setFilter((current) => (current === candidate ? null : candidate))}
              size="sm"
              type="button"
              variant={filter === candidate ? "default" : "outline"}
            >
              {candidate}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p
          className="mt-8 rounded-[1.375rem] border border-border bg-card p-6 text-muted-foreground"
          role="status"
        >
          No events match this status. Choose another status or plan a future fixture.
        </p>
      ) : surface === "events" || view === "agenda" ? (
        <ol className="mt-8 divide-y divide-border-dark overflow-hidden rounded-[1.375rem] border border-border bg-card">
          {visible.map((event) => (
            <CalendarRow
              event={event}
              key={event.id}
              href={
                slug
                  ? venueEventHref(event.id, slug, surface, event.status === "draft")
                  : `/events/${event.id}`
              }
            />
          ))}
        </ol>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(([day, dayEvents]) => (
            <section className="rounded-[1.375rem] border border-border bg-card p-5" key={day}>
              <h2 className="text-lg font-semibold">{day}</h2>
              <ol className="mt-4 space-y-2">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      className="block min-h-11 rounded-xl bg-muted p-3 outline-none hover:ring-1 hover:ring-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      href={
                        slug
                          ? venueEventHref(event.id, slug, surface, event.status === "draft")
                          : `/events/${event.id}`
                      }
                    >
                      <span className="block font-semibold">{event.title}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {israelTime(event.startsAt)} · {event.venueSpace?.name ?? "No area"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarRow({ event, href }: Readonly<{ event: VenueCalendarEntry; href: string }>) {
  const status = statusFor(event);
  return (
    <li>
      <Link
        className="grid min-h-20 gap-3 p-5 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        href={href}
      >
        <span>
          <span className="block font-semibold">{event.title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {israelDate(event.startsAt)}, {israelTime(event.startsAt)} ·{" "}
            {event.venueSpace?.name ?? "No area"}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Badge variant={status === "Full" ? "secondary" : "outline"}>{status}</Badge>
          <span className="text-sm text-muted-foreground">
            {event.attendanceMode === "open_door"
              ? "Open door"
              : `${event.approvedAttendeeCount}/${event.capacity}`}
          </span>
        </span>
      </Link>
    </li>
  );
}
