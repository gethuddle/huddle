import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ShareLinkButton } from "@/components/share/share-link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { EventBadges } from "@/features/events/components/event-badges";
import { getEventSummary } from "@/features/events/queries";
import { deriveEventViewerRole, eventViewerPresentation } from "@/features/events/viewer-role";
import { getGroupDetail } from "@/features/groups/detail";
import { ReportControl } from "@/features/moderation/components/report-control";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { formatIsraelKickoff } from "@/features/sports/time";
import { DomainError } from "@/lib/errors";
import { collectionPageCount, collectionPageInput } from "@/lib/pagination";
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
  const openDoor = event.attendanceMode === "open_door";
  const viewerRole = deriveEventViewerRole({
    canManage: event.canManage,
    hostKind: event.host.kind,
    viewerAttendanceStatus: event.viewerAttendanceStatus,
    viewerInvitationStatus: event.viewerInvitationStatus,
  });
  const viewerPresentation = eventViewerPresentation(viewerRole, event.status);
  const rawQuery = await searchParams;
  const rawCreated = Array.isArray(rawQuery.created) ? rawQuery.created[0] : rawQuery.created;
  const created = rawCreated === "1";
  const rawAttendeePage = rawQuery.attendeePage;
  const attendeePageInput = collectionPageInput(
    Array.isArray(rawAttendeePage) ? rawAttendeePage[0] : rawAttendeePage,
  );
  if (attendeePageInput.wasAboveWindow) {
    redirect(eventAttendeePageHref(event.id, attendeePageInput.page, created));
  }
  const attendeePage = attendeePageInput.page;
  const [privateLocation, approvedAttendees, organizingGroup] = await Promise.all([
    event.viewerCanReadPrivateLocation ? readPrivateLocation(event.id) : Promise.resolve(null),
    !openDoor && (event.canManage || event.viewerAttendanceStatus === "approved")
      ? readApprovedAttendees(event.id, attendeePage)
      : Promise.resolve([]),
    event.audience === "group" &&
    event.organizingGroupSlug !== null &&
    event.viewerIsAuthenticated &&
    !event.canManage
      ? getGroupDetail(event.organizingGroupSlug)
      : Promise.resolve(null),
  ]);
  const viewerNeedsGroupMembership =
    event.audience === "group" &&
    event.organizingGroupSlug !== null &&
    event.viewerIsAuthenticated &&
    !event.canManage &&
    organizingGroup?.viewerMembershipStatus !== "active";
  const attendeeTotal = approvedAttendees.at(0)?.total_count ?? 0;
  const attendeePageCount = collectionPageCount(attendeeTotal);
  if (!openDoor && attendeePage > 1 && approvedAttendees.length === 0) {
    const firstAttendees = await readApprovedAttendees(event.id, 1);
    const finalPage = collectionPageCount(firstAttendees.at(0)?.total_count ?? 0);
    if (attendeePage > finalPage) {
      redirect(eventAttendeePageHref(event.id, finalPage, created));
    }
  }

  return (
    <section className="py-12 sm:py-16">
      {created ? (
        <Alert className="mb-6 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-court-hover">
            Your event is saved and now lives in My Huddle. Invite eligible people or manage it
            whenever you need.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost">
          <Link href={"/matches/" + event.match.id}>← Fixture details</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{event.status.replaceAll("_", " ")}</Badge>
          <ShareLinkButton label="Share event" title={event.title} />
        </div>
      </div>

      <div className="mt-5">
        <EventBadges
          approvedAttendeeCount={event.approvedAttendeeCount}
          attendanceMode={event.attendanceMode}
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
              <Detail label="Kickoff" value={formatIsraelKickoff(event.startsAt)} />
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
                label="Attendance"
                value={
                  openDoor
                    ? "Open door · just come along"
                    : `${event.approvedAttendeeCount} approved · ${event.remainingCapacity} remaining of ${event.capacity}`
                }
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
              <p className="font-semibold text-sand">Location privacy</p>
              <p className="mt-2 text-sm leading-6 text-muted-dark">
                {event.placeKind === "home"
                  ? privateLocation === null
                    ? "The exact home address stays hidden until your attendance is approved."
                    : "You can see the address while your attendance is approved. Leaving, removal, blocking or cancellation removes future access."
                  : event.placeKind === "venue"
                    ? "This event uses the venue's public address."
                    : "This event takes place at a public location."}
              </p>
              {event.placeKind === "home" ? (
                <p className="mt-3 text-sm leading-6 text-muted-dark">
                  Removing access cannot erase an address someone already viewed.
                </p>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-muted-dark">
                {openDoor
                  ? "This is a public walk-in event. Huddle does not collect RSVPs, invitations, or a guest list."
                  : `Everyone attends with their own Huddle account${event.requiresApproval ? " and host approval." : "."}`}
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <p className="text-sm font-semibold text-court">
                {openDoor ? "How attendance works" : "Your event status"}
              </p>
              <h2 className="text-xl font-semibold text-linen">
                {openDoor
                  ? "No reservation needed"
                  : viewerNeedsGroupMembership
                    ? organizingGroup?.viewerMembershipStatus === "pending"
                      ? "Your group application is pending"
                      : "Join the group to attend"
                    : viewerPresentation.status}
              </h2>
            </CardHeader>
            <CardContent>
              {openDoor ? (
                <p className="text-sm leading-6 text-muted-dark">
                  Turn up at the venue for kickoff. Availability is managed by the venue in person,
                  not through a Huddle place counter.
                </p>
              ) : viewerNeedsGroupMembership ? (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-muted-dark">
                    This event is organized for active members of {event.organizingGroupName}. Open
                    the group to apply or check your membership status.
                  </p>
                  <Button asChild className="w-full">
                    <Link href={`/groups/${event.organizingGroupSlug}`}>
                      {organizingGroup?.viewerMembershipStatus === "pending"
                        ? "View application"
                        : organizingGroup?.canApply === false
                          ? "View group"
                          : "View group and apply"}
                    </Link>
                  </Button>
                </div>
              ) : (
                <EventParticipationControls
                  canManage={event.canManage}
                  eventId={event.id}
                  eventStatus={event.status}
                  hostKind={event.host.kind}
                  remainingCapacity={event.remainingCapacity ?? 0}
                  requiresApproval={event.requiresApproval}
                  viewerAttendanceId={event.viewerAttendanceId}
                  viewerAttendanceStatus={event.viewerAttendanceStatus}
                  viewerInvitationId={event.viewerInvitationId}
                  viewerInvitationStatus={event.viewerInvitationStatus}
                  viewerIsAuthenticated={event.viewerIsAuthenticated}
                  viewerRole={viewerRole}
                />
              )}
            </CardContent>
          </Card>

          <div className="scroll-mt-24" id="approved-attendees">
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
                              attendeePage === 1
                                ? undefined
                                : eventAttendeePageHref(event.id, attendeePage - 1, created)
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
                                : eventAttendeePageHref(event.id, attendeePage + 1, created)
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>

          {event.organizingGroupName === null ? null : (
            <Card size="sm">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-dark">
                  Organizing group
                </p>
                {event.organizingGroupSlug === null ? (
                  <p className="mt-2 font-semibold text-linen">{event.organizingGroupName}</p>
                ) : (
                  <Link
                    className="mt-2 inline-block font-semibold text-linen hover:text-court"
                    href={`/groups/${event.organizingGroupSlug}`}
                  >
                    {event.organizingGroupName}
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <ReportControl targetId={event.id} targetLabel={event.title} targetType="event" />
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

function eventAttendeePageHref(eventId: string, page: number, created: boolean) {
  const query = new URLSearchParams();
  if (created) query.set("created", "1");
  query.set("attendeePage", page.toString());
  return `/events/${eventId}?${query.toString()}#approved-attendees`;
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">{label}</dt>
      <dd className="mt-2 font-semibold text-linen">{value}</dd>
    </div>
  );
}
