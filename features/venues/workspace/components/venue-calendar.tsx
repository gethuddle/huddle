"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { VenueCalendarEntry, VenueCalendarStatus } from "@/features/venues/workspace/types";
import { cn } from "@/lib/utils";
import { venueCollectionHref, venueEventHref } from "@/features/venues/workspace/event-links";
import {
  collectionHasOverflow,
  collectionPageCount,
  collectionVisibleTotal,
} from "@/lib/pagination";

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
  status: serverStatus,
  page = 1,
  totalCount,
}: Readonly<{
  events: readonly VenueCalendarEntry[];
  surface?: "calendar" | "events";
  slug?: string;
  status?: VenueCalendarStatus;
  page?: number;
  totalCount?: number;
}>) {
  const [view, setView] = useState<"agenda" | "month">("agenda");
  const [localFilter, setLocalFilter] = useState<CalendarFilter | null>(null);
  const filter =
    serverStatus === undefined
      ? localFilter
      : serverStatus === "all"
        ? null
        : (
            {
              draft: "Draft",
              published: "Published",
              full: "Full",
              cancelled: "Cancelled",
              completed: "Completed",
            } as const
          )[serverStatus];
  const returnTo =
    slug && serverStatus !== undefined
      ? venueCollectionHref(slug, surface, serverStatus, page)
      : undefined;
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
    <div className="mt-8 scroll-mt-24" id={`venue-${surface}`}>
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
          {serverStatus !== undefined && slug ? (
            <Button asChild size="sm" variant={filter === null ? "default" : "outline"}>
              <Link
                aria-current={filter === null ? "page" : undefined}
                href={venueCollectionHref(slug, surface, "all", 1)}
              >
                All
              </Link>
            </Button>
          ) : null}
          {FILTERS.map((candidate) =>
            serverStatus !== undefined && slug ? (
              <Button
                asChild
                key={candidate}
                size="sm"
                variant={filter === candidate ? "default" : "outline"}
              >
                <Link
                  aria-current={filter === candidate ? "page" : undefined}
                  href={venueCollectionHref(
                    slug,
                    surface,
                    candidate.toLowerCase() as VenueCalendarStatus,
                    1,
                  )}
                >
                  {candidate}
                </Link>
              </Button>
            ) : (
              <Button
                aria-pressed={filter === candidate}
                key={candidate}
                onClick={() =>
                  setLocalFilter((current) => (current === candidate ? null : candidate))
                }
                size="sm"
                type="button"
                variant={filter === candidate ? "default" : "outline"}
              >
                {candidate}
              </Button>
            ),
          )}
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
                  ? venueEventHref(event.id, slug, surface, event.status === "draft", returnTo)
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
                          ? venueEventHref(
                              event.id,
                              slug,
                              surface,
                              event.status === "draft",
                              returnTo,
                            )
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
      {totalCount !== undefined && collectionHasOverflow(totalCount) ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Showing the first {collectionVisibleTotal(totalCount).toLocaleString("en-US")} events. Use
          the filters to narrow the collection.
        </p>
      ) : null}
      {totalCount !== undefined && collectionPageCount(totalCount) > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page === 1}
                href={
                  page > 1 && slug && serverStatus
                    ? venueCollectionHref(slug, surface, serverStatus, page - 1)
                    : undefined
                }
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                Page {page} of {collectionPageCount(totalCount)}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= collectionPageCount(totalCount)}
                href={
                  page < collectionPageCount(totalCount) && slug && serverStatus
                    ? venueCollectionHref(slug, surface, serverStatus, page + 1)
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
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
