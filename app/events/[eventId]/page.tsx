import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EventParticipationControls } from "@/features/attendance/components/event-participation-controls";
import { getPrivateEventLocation, listApprovedEventAttendees } from "@/features/attendance/queries";
import { eventPageSchema } from "@/features/attendance/schemas";
import { EventBadges } from "@/features/events/components/event-badges";
import { getEventSummary } from "@/features/events/queries";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { formatJerusalemKickoff } from "@/features/sports/time";
import { DomainError } from "@/lib/errors";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";

export const metadata: Metadata = {
  title: "Event details — Huddle",
};

type EventPageProps = Readonly<{
  params: Promise<Readonly<{ eventId: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const parsedId = eventRouteIdSchema.safeParse((await params).eventId);
  if (!parsedId.success) notFound();
  const event = await getEventSummary(parsedId.data);
  if (event === null) notFound();
  const rawAttendeePage = (await searchParams).attendeePage;
  const attendeePage = eventPageSchema.parse(
    Array.isArray(rawAttendeePage) ? rawAttendeePage[0] : rawAttendeePage,
  );
  const [privateLocation, approvedAttendees] = await Promise.all([
    event.viewerCanReadPrivateLocation ? readPrivateLocation(event.id) : Promise.resolve(null),
    event.canManage || event.viewerAttendanceStatus === "approved"
      ? readApprovedAttendees(event.id, attendeePage)
      : Promise.resolve([]),
  ]);
  const attendeeTotal = approvedAttendees.at(0)?.total_count ?? 0;
  const attendeePageCount = Math.max(1, Math.ceil(attendeeTotal / 20));

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost">
          <Link href={"/matches/" + event.match.id}>← Fixture details</Link>
        </Button>
        <Badge variant="outline">{event.status.replaceAll("_", " ")}</Badge>
      </div>

      <div className="mt-5">
        <EventBadges
          approvedAttendeeCount={event.approvedAttendeeCount}
          audience={event.audience}
          audienceTeamName={event.audienceTeamName}
          capacity={event.capacity}
          hostKind={event.host.kind}
          placeKind={event.placeKind}
          requiresApproval={event.requiresApproval}
          venueVerificationStatus={event.host.venueVerificationStatus}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="rounded-[2rem]">
          <CardHeader>
            <p className="text-sm font-semibold text-court">
              {event.match.homeTeamName} vs {event.match.awayTeamName}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
              {event.title}
            </h1>
            <p className="mt-3 text-muted-dark">{event.match.competitionName}</p>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-lg leading-8 text-muted-dark">
              {event.description}
            </p>
            <dl className="mt-8 grid gap-5 border-y border-border-dark py-6 sm:grid-cols-2">
              <Detail label="Kickoff" value={formatJerusalemKickoff(event.startsAt)} />
              <Detail label="City" value={event.cityName} />
              <Detail
                label="Location"
                value={
                  privateLocation !== null
                    ? `${privateLocation.address_text}${privateLocation.directions === null ? "" : ` — ${privateLocation.directions}`}`
                    : event.placeKind === "public_place" &&
                        event.publicPlaceName !== null &&
                        event.publicAddressText !== null
                      ? `${event.publicPlaceName} — ${event.publicAddressText}`
                      : event.locationSummary
                }
              />
              <Detail
                label="Capacity"
                value={`${event.approvedAttendeeCount} approved · ${event.remainingCapacity} remaining of ${event.capacity}`}
              />
              <Detail label="Expected activity" value={event.expectedActivity} />
              <Detail label="Cost" value={event.costDescription} />
            </dl>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <div>
                <h2 className="font-semibold text-linen">Event rules</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-dark">
                  {event.eventRules}
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-linen">Commercial affiliation</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-dark">
                  {event.commercialAffiliation}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-5 self-start">
          <Card className="bg-surface-deep" size="sm">
            <CardHeader>
              <h2 className="text-xl font-semibold text-linen">Hosted by</h2>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-linen">{event.host.displayName}</p>
              {event.host.handle === null ? null : (
                <Button asChild className="mt-4" variant="outline">
                  <Link href={"/people/" + event.host.handle}>@{event.host.handle}</Link>
                </Button>
              )}
              {event.host.venueSlug === null ? null : (
                <Button asChild className="mt-4" variant="outline">
                  <Link href={`/venues/${event.host.venueSlug}`}>Open venue profile</Link>
                </Button>
              )}
              {event.host.venueVerificationStatus === null ? null : (
                <div className="mt-4">
                  <VenueVerificationBadge status={event.host.venueVerificationStatus} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-sand/40 bg-sand/10" size="sm">
            <CardContent>
              <p className="font-semibold text-sand">Protected location boundary</p>
              <p className="mt-2 text-sm leading-6 text-muted-dark">
                {event.placeKind === "home"
                  ? privateLocation === null
                    ? "This summary deliberately contains no exact home address or coordinate."
                    : "Your current authorization allowed one audited address read. Leaving, removal, blocking, suspension, relationship loss, or cancellation ends future access."
                  : event.placeKind === "venue"
                    ? "This listing uses the venue profile's public business address."
                    : "This is an ordinary public-place location."}
              </p>
              {event.placeKind === "home" ? (
                <p className="mt-3 text-sm leading-6 text-muted-dark">
                  Revocation prevents future reads; Huddle cannot make an address someone already
                  viewed unknown.
                </p>
              ) : null}
              {event.viewerAttendanceStatus === null ? null : (
                <p className="mt-3 text-sm font-semibold text-court">
                  Your attendance status: {event.viewerAttendanceStatus}
                </p>
              )}
              <p className="mt-3 text-sm leading-6 text-muted-dark">
                Attendance requires one registered account per person
                {event.requiresApproval ? " and host approval." : "."}
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <h2 className="text-xl font-semibold text-linen">Join this huddle</h2>
            </CardHeader>
            <CardContent>
              <EventParticipationControls
                canManage={event.canManage}
                eventId={event.id}
                eventStatus={event.status}
                hostKind={event.host.kind}
                remainingCapacity={event.remainingCapacity}
                requiresApproval={event.requiresApproval}
                viewerAttendanceId={event.viewerAttendanceId}
                viewerAttendanceStatus={event.viewerAttendanceStatus}
                viewerInvitationId={event.viewerInvitationId}
                viewerInvitationStatus={event.viewerInvitationStatus}
                viewerIsAuthenticated={event.viewerIsAuthenticated}
              />
            </CardContent>
          </Card>

          {approvedAttendees.length === 0 ? null : (
            <Card size="sm">
              <CardHeader>
                <h2 className="text-xl font-semibold text-linen">Approved attendees</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {approvedAttendees.map((attendee) => (
                    <li key={attendee.profile_handle}>
                      <Link
                        className="text-sm font-semibold text-linen hover:text-court"
                        href={`/people/${attendee.profile_handle}`}
                      >
                        {attendee.display_name} · @{attendee.profile_handle}
                      </Link>
                    </li>
                  ))}
                </ul>
                {attendeePageCount > 1 ? (
                  <Pagination className="mt-5">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          aria-disabled={attendeePage === 1}
                          href={
                            attendeePage === 1 ? undefined : `?attendeePage=${attendeePage - 1}`
                          }
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-3 text-xs text-muted-dark">
                          {attendeePage}/{attendeePageCount}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          aria-disabled={attendeePage >= attendeePageCount}
                          href={
                            attendeePage >= attendeePageCount
                              ? undefined
                              : `?attendeePage=${attendeePage + 1}`
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                ) : null}
              </CardContent>
            </Card>
          )}

          {event.organizingGroupName === null ? null : (
            <Card size="sm">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-dark">
                  Organizing group
                </p>
                <p className="mt-2 font-semibold text-linen">{event.organizingGroupName}</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </section>
  );
}

async function readPrivateLocation(eventId: string) {
  try {
    return await getPrivateEventLocation(eventId);
  } catch (error) {
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") return null;
    throw error;
  }
}

async function readApprovedAttendees(eventId: string, page: number) {
  try {
    return await listApprovedEventAttendees(eventId, page);
  } catch (error) {
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") return [];
    throw error;
  }
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">{label}</dt>
      <dd className="mt-2 font-semibold text-linen">{value}</dd>
    </div>
  );
}
