import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ContextBackLink, safeExploreReturnTo } from "@/components/navigation/context-back-link";
import { safeVenueEventReturnTo } from "@/features/venues/workspace/event-links";
import { ShareLinkButton } from "@/components/share/share-link-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { requireActor } from "@/features/auth/actor";
import { EventReviewControl } from "@/features/groups/components/group-management-controls";
import { EventParticipationControls } from "@/features/attendance/components/event-participation-controls";
import { getPrivateEventLocation, listApprovedEventAttendees } from "@/features/attendance/queries";
import { EventBadges } from "@/features/events/components/event-badges";
import { getEventSummary } from "@/features/events/queries";
import { deriveEventViewerRole, eventViewerPresentation } from "@/features/events/viewer-role";
import { getGroupDetail } from "@/features/groups/detail";
import { ReportControl } from "@/features/moderation/components/report-control";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { TeamMark } from "@/features/sports/components/team-initials";
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
  const viewerPresentation = eventViewerPresentation(viewerRole, event.status, {
    hostKind: event.host.kind,
    requiresApproval: event.requiresApproval,
    remainingCapacity: event.remainingCapacity,
  });
  const rawQuery = await searchParams;
  const rawReturnTo = Array.isArray(rawQuery.returnTo) ? rawQuery.returnTo[0] : rawQuery.returnTo;
  const venueReturnTo = safeVenueEventReturnTo(rawReturnTo, event.host.venueSlug, event.canManage);
  const returnTo = venueReturnTo ?? safeExploreReturnTo(rawReturnTo);
  const venueFallback =
    event.canManage && event.host.kind === "venue" && event.host.venueSlug !== null
      ? `/venues/${encodeURIComponent(event.host.venueSlug)}/workspace`
      : null;
  const rawCreated = Array.isArray(rawQuery.created) ? rawQuery.created[0] : rawQuery.created;
  const created = rawCreated === "1";
  const rawAttendeePage = rawQuery.attendeePage;
  const attendeePageInput = collectionPageInput(
    Array.isArray(rawAttendeePage) ? rawAttendeePage[0] : rawAttendeePage,
  );
  if (attendeePageInput.wasAboveWindow) {
    redirect(eventAttendeePageHref(event.id, attendeePageInput.page, created, returnTo));
  }
  const attendeePage = attendeePageInput.page;
  const pendingPersonalSubmission =
    event.status === "pending_group_review" &&
    event.host.kind === "person" &&
    event.organizingGroupSlug !== null;
  const [privateLocation, approvedAttendees, organizingGroup, viewerIsSubmitter] =
    await Promise.all([
      event.viewerCanReadPrivateLocation ? readPrivateLocation(event.id) : Promise.resolve(null),
      !openDoor && (event.canManage || event.viewerAttendanceStatus === "approved")
        ? readApprovedAttendees(event.id, attendeePage)
        : Promise.resolve([]),
      event.audience === "group" &&
      event.organizingGroupSlug !== null &&
      event.viewerIsAuthenticated &&
      (!event.canManage || pendingPersonalSubmission)
        ? getGroupDetail(event.organizingGroupSlug)
        : Promise.resolve(null),
      pendingPersonalSubmission && event.viewerIsAuthenticated && event.host.handle !== null
        ? viewerMatchesPersonalHost(event.host.handle)
        : Promise.resolve(false),
    ]);
  const canWithdrawSubmission =
    pendingPersonalSubmission && viewerIsSubmitter && organizingGroup !== null;
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
      redirect(eventAttendeePageHref(event.id, finalPage, created, returnTo));
    }
  }

  return (
    <section className="py-12 sm:py-16">
      {event.status === "cancelled" ? (
        <Alert className="mb-6" role="status">
          <AlertDescription>This event has been cancelled.</AlertDescription>
        </Alert>
      ) : null}
      {created ? (
        <Alert className="mb-6 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-forest-hover">
            Your event is saved and now lives in My Huddle. Invite eligible people or manage it
            whenever you need.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {venueReturnTo !== null || (returnTo === null && venueFallback !== null) ? (
          <Button asChild variant="ghost">
            <Link href={venueReturnTo ?? venueFallback!}>
              <span aria-hidden="true">←</span>Back to venue
            </Link>
          </Button>
        ) : (
          <ContextBackLink fallbackHref="/discover" returnTo={returnTo} />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {event.canManage && event.host.kind === "venue" ? (
            <Button asChild variant="outline">
              <Link
                href={`/events/${event.id}/manage${returnTo ? `?${new URLSearchParams({ returnTo })}` : ""}`}
              >
                {event.status === "draft" ? "Edit draft" : "Manage event"}
              </Link>
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {event.status === "published" ? "Published event" : event.status.replaceAll("_", " ")}
          </span>
          <ShareLinkButton label="Share event" title={event.title} />
        </div>
      </div>

      <div className="mt-5">
        <EventBadges
          eventStatus={event.status}
          approvedAttendeeCount={event.approvedAttendeeCount}
          attendanceMode={event.attendanceMode}
          audience={event.audience}
          audienceTeamName={event.audienceTeamName}
          capacity={event.capacity}
          placeKind={event.placeKind}
          requiresApproval={event.requiresApproval}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <TeamMark
                crestUrl={event.match.homeTeamCrestUrl}
                name={event.match.homeTeamName}
                size="sm"
                tla={event.match.homeTeamTla}
              />
              <p className="text-sm font-semibold text-foreground">
                {event.match.homeTeamName} vs {event.match.awayTeamName}
              </p>
              <TeamMark
                crestUrl={event.match.awayTeamCrestUrl}
                name={event.match.awayTeamName}
                size="sm"
                tla={event.match.awayTeamTla}
              />
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
              {event.title}
            </h1>
            <p className="mt-3 text-muted-foreground">{event.match.competitionName}</p>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-lg leading-8 text-muted-foreground">
              {event.description}
            </p>
            <dl className="mt-8 grid gap-5 border-y border-border py-6 sm:grid-cols-2">
              <Detail label="Kickoff" value={formatIsraelKickoff(event.startsAt)} />
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
            <details className="mt-6 rounded-xl bg-muted px-4 py-3">
              <summary className="cursor-pointer font-semibold text-foreground">
                Safety and event details
              </summary>
              <div className="mt-4 grid gap-6 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <h2 className="font-semibold text-foreground">Event rules</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {event.eventRules}
                  </p>
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Commercial affiliation</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {event.commercialAffiliation}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <h2 className="font-semibold text-foreground">Location and attendance</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {event.placeKind === "home"
                      ? privateLocation === null
                        ? "The exact home address stays hidden until your attendance is approved."
                        : "You can see the address while your attendance is approved. Leaving, removal, blocking or cancellation removes future access."
                      : event.placeKind === "venue"
                        ? "This event uses the venue's public address."
                        : "This event takes place at a public location."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {openDoor
                      ? "This is a public walk-in event with no digital guest list."
                      : `Everyone attends with their own Huddle account${event.requiresApproval ? " and host approval." : "."}`}
                  </p>
                  {event.placeKind === "home" ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Removing access cannot erase an address someone already viewed.
                    </p>
                  ) : null}
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <aside className="space-y-5 self-start">
          <section className="border-b border-border pb-5" aria-labelledby="event-host-heading">
            <h2 className="text-sm font-medium text-muted-foreground" id="event-host-heading">
              Hosted by
            </h2>
            <p className="mt-2 text-lg font-semibold text-foreground">{event.host.displayName}</p>
            {event.host.venueVerificationStatus === null ? null : (
              <div className="mt-1">
                <VenueVerificationBadge status={event.host.venueVerificationStatus} />
              </div>
            )}
            {event.host.handle === null ? null : (
              <Button asChild className="mt-4" variant="outline">
                <Link href={"/people/" + event.host.handle}>Open @{event.host.handle}</Link>
              </Button>
            )}
            {!event.host.canOpenVenue || event.host.venueSlug === null ? null : (
              <Button asChild className="mt-4" variant="outline">
                <Link href={`/venues/${event.host.venueSlug}`}>Open venue</Link>
              </Button>
            )}
          </section>

          <Card size="sm">
            <CardHeader>
              <p className="text-sm font-semibold text-forest">
                {openDoor ? "How attendance works" : "Your event status"}
              </p>
              <h2 className="text-xl font-semibold text-foreground">
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
              {canWithdrawSubmission ? (
                <EventReviewControl
                  canReview={false}
                  canWithdraw
                  eventId={event.id}
                  eventTitle={event.title}
                  groupId={organizingGroup.id}
                  groupSlug={organizingGroup.slug}
                />
              ) : openDoor ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  Turn up at the venue for kickoff. Availability is managed by the venue in person,
                  not through a Huddle place counter. Huddle does not collect RSVPs or a guest list.
                </p>
              ) : event.canManage && event.host.kind === "venue" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Use Manage event to review requests and manage attendees.
                  </p>
                  {event.status === "published" ? (
                    <Button asChild variant="outline">
                      <a href={`/api/events/${event.id}/calendar.ics`}>Add to calendar</a>
                    </Button>
                  ) : null}
                </div>
              ) : viewerNeedsGroupMembership ? (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">
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
                  <h2 className="text-xl font-semibold text-foreground">Approved attendees</h2>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {approvedAttendees.map((attendee) => (
                      <li key={attendee.profile_handle}>
                        <Link
                          className="text-sm font-semibold text-foreground hover:text-forest"
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
                                : eventAttendeePageHref(
                                    event.id,
                                    attendeePage - 1,
                                    created,
                                    returnTo,
                                  )
                            }
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-3 text-xs text-muted-foreground">
                            {attendeePage}/{attendeePageCount}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            aria-disabled={attendeePage >= attendeePageCount}
                            href={
                              attendeePage >= attendeePageCount
                                ? undefined
                                : eventAttendeePageHref(
                                    event.id,
                                    attendeePage + 1,
                                    created,
                                    returnTo,
                                  )
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
            <section className="border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">Organizing group</p>
              {event.organizingGroupSlug === null ? (
                <p className="mt-2 font-semibold text-foreground">{event.organizingGroupName}</p>
              ) : (
                <Link
                  className="mt-2 inline-block font-semibold text-foreground hover:text-forest"
                  href={`/groups/${event.organizingGroupSlug}`}
                >
                  {event.organizingGroupName}
                </Link>
              )}
            </section>
          )}

          <ReportControl targetId={event.id} targetLabel={event.title} targetType="event" />
        </aside>
      </div>
    </section>
  );
}

async function viewerMatchesPersonalHost(hostHandle: string) {
  try {
    // Personal creation binds the creator and host to the authenticated actor.
    // The withdrawal RPC independently rechecks both IDs and the pending lifecycle.
    const { profile } = await requireActor("authenticated");
    return profile.handle === hostHandle;
  } catch (error) {
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") return false;
    throw error;
  }
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

function eventAttendeePageHref(
  eventId: string,
  page: number,
  created: boolean,
  returnTo: string | null,
) {
  const query = new URLSearchParams();
  if (created) query.set("created", "1");
  if (returnTo !== null) query.set("returnTo", returnTo);
  query.set("attendeePage", page.toString());
  return `/events/${eventId}?${query.toString()}#approved-attendees`;
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 font-semibold text-foreground">{value}</dd>
    </div>
  );
}
