import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EventManagementControls } from "@/features/attendance/components/event-management-controls";
import type { EventInvitationCandidate } from "@/features/attendance/components/event-invitation-picker";
import {
  listEventAttendance,
  listEventInvitations,
  listEventInviteLinks,
} from "@/features/attendance/queries";
import { getEventSummary } from "@/features/events/queries";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { listPeopleHub } from "@/features/people/search";
import { DomainError } from "@/lib/errors";
import { collectionPageCount, collectionPageInput } from "@/lib/pagination";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";
import { BillingStatusBanner } from "@/features/venue-billing/components/billing-status-banner";
import { getVenueEventForManagement } from "@/features/venues/workspace/queries";
import { VenueEventEditor } from "@/features/venues/workspace/components/venue-event-editor";
import { safeVenueEventReturnTo } from "@/features/venues/workspace/event-links";
import { safeExploreReturnTo } from "@/components/navigation/context-back-link";

export const metadata: Metadata = { title: "Manage event — Huddle" };

type Props = Readonly<{
  params: Promise<Readonly<{ eventId: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function ManageEventPage({ params, searchParams }: Props) {
  const parsedId = eventRouteIdSchema.safeParse((await params).eventId);
  if (!parsedId.success) notFound();
  const event = await getEventSummary(parsedId.data);
  if (event === null || !event.canManage) notFound();
  const workspace =
    event.host.kind === "venue" && event.host.venueSlug
      ? await getAuthorizedVenueWorkspaceBySlug(event.host.venueSlug)
      : null;
  if (event.host.kind === "venue" && workspace === null) notFound();
  const canOperate = workspace?.billing.canOperateExistingEvents ?? true;
  const startsInFuture = Date.parse(event.startsAt) > new Date().getTime();
  const canInvite =
    workspace === null ||
    (workspace.billing.isPublic &&
      (workspace.billing.publishCutoffAt === null ||
        Date.parse(event.startsAt) < Date.parse(workspace.billing.publishCutoffAt)));

  const query = await searchParams;
  const rawReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  const returnTo =
    safeVenueEventReturnTo(rawReturnTo, event.host.venueSlug, event.canManage) ??
    safeExploreReturnTo(rawReturnTo);
  const returnQuery = returnTo === null ? "" : `?${new URLSearchParams({ returnTo })}`;
  const managedEventId = event.id;
  function managementPageHref(page: number) {
    const query = new URLSearchParams();
    if (returnTo !== null) query.set("returnTo", returnTo);
    query.set("page", String(page));
    return `/events/${managedEventId}/manage?${query}#event-management-queue`;
  }
  const managedEvent = workspace === null ? null : await getVenueEventForManagement(event.id);
  const rawPage = query.page;
  const pageInput = collectionPageInput(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  if (pageInput.wasAboveWindow) {
    redirect(managementPageHref(pageInput.page));
  }
  const page = pageInput.page;
  const openDoor = event.attendanceMode === "open_door";
  const canShareInviteLink =
    !openDoor && event.host.kind === "person" && event.audience === "invite_only";
  const [invitations, attendance, people, inviteLinks] = await Promise.all([
    openDoor ? Promise.resolve([]) : listEventInvitations(event.id, page),
    openDoor ? Promise.resolve([]) : listEventAttendance(event.id, page),
    openDoor || !canInvite ? Promise.resolve([]) : readInvitationPeople(),
    canShareInviteLink ? listEventInviteLinks(event.id) : Promise.resolve([]),
  ]);
  const total = Math.max(invitations.at(0)?.total_count ?? 0, attendance.at(0)?.total_count ?? 0);
  const pageCount = collectionPageCount(total);
  if (!openDoor && page > 1 && invitations.length === 0 && attendance.length === 0) {
    const [firstInvitations, firstAttendance] = await Promise.all([
      listEventInvitations(event.id, 1),
      listEventAttendance(event.id, 1),
    ]);
    const firstTotal = Math.max(
      firstInvitations.at(0)?.total_count ?? 0,
      firstAttendance.at(0)?.total_count ?? 0,
    );
    const finalPage = collectionPageCount(firstTotal);
    if (page > finalPage) {
      redirect(managementPageHref(finalPage));
    }
  }
  const candidates = invitationCandidates(people, invitations, attendance);

  return (
    <section className="py-12 sm:py-16">
      <Button asChild variant="ghost">
        <Link href={`/events/${event.id}${returnQuery}`}>← Event details</Link>
      </Button>
      <p className="mt-8 text-sm font-medium text-forest">Event management</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
        {event.title}
      </h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        {event.status === "draft"
          ? "This draft is private. Review its details, publish when ready, or cancel it to plan this fixture again."
          : openDoor
            ? workspace !== null && !workspace.billing.isPublic
              ? "This walk-in fixture is private. There is no digital guest list to manage."
              : "This fixture is public and walk-in. There is no digital guest list to manage."
            : canInvite
              ? "Invite people, review attendance requests, and manage approved attendees."
              : canOperate
                ? "Review existing attendance requests and manage approved attendees."
                : "Attendance and invitation history remains available. Editing is locked."}
      </p>
      {workspace ? <BillingStatusBanner context={workspace.billing} slug={workspace.slug} /> : null}

      {managedEvent && workspace ? (
        <VenueEventEditor
          event={managedEvent}
          canEdit={
            event.status === "draft"
              ? workspace.billing.canPrepareDrafts
              : event.status === "published" && startsInFuture && canOperate
          }
          canPublish={
            event.status === "draft" &&
            startsInFuture &&
            workspace.billing.canPublish &&
            (workspace.billing.publishCutoffAt === null ||
              Date.parse(event.startsAt) < Date.parse(workspace.billing.publishCutoffAt))
          }
        />
      ) : null}

      <div className="mt-10" id="event-management-queue">
        <EventManagementControls
          canInvite={canInvite}
          canOperate={canOperate}
          attendance={attendance}
          attendanceMode={event.attendanceMode}
          candidates={candidates}
          eventAudience={event.audience}
          eventId={event.id}
          eventStatus={event.status}
          inviteLinks={inviteLinks}
          invitations={invitations}
          remainingCapacity={event.remainingCapacity ?? undefined}
        />
      </div>

      {pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page === 1}
                href={page === 1 ? undefined : managementPageHref(page - 1)}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= pageCount}
                href={page >= pageCount ? undefined : managementPageHref(page + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}

async function readInvitationPeople() {
  try {
    const [accepted, suggested] = await Promise.all([
      listPeopleHub("accepted"),
      listPeopleHub("suggested"),
    ]);
    return [...accepted.items, ...suggested.items];
  } catch (error) {
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") return [];
    throw error;
  }
}

function invitationCandidates(
  people: Awaited<ReturnType<typeof readInvitationPeople>>,
  invitations: Awaited<ReturnType<typeof listEventInvitations>>,
  attendance: Awaited<ReturnType<typeof listEventAttendance>>,
): EventInvitationCandidate[] {
  const candidates = new Map<string, EventInvitationCandidate>();
  for (const person of people) {
    candidates.set(person.id, {
      id: person.id,
      handle: person.handle,
      displayName: person.displayName,
      context:
        person.friendship?.status === "accepted" ? "Friend" : (person.reason ?? "Suggested person"),
      eligible: true,
      ineligibilityReason: null,
    });
  }
  for (const invitation of invitations) {
    if (invitation.invitee_handle === null) {
      candidates.delete(invitation.invitee_id);
      continue;
    }
    candidates.set(invitation.invitee_id, {
      id: invitation.invitee_id,
      handle: invitation.invitee_handle,
      displayName: invitation.invitee_display_name,
      context: "Recent authorized person",
      eligible: invitation.status === "revoked" || invitation.status === "declined",
      ineligibilityReason:
        invitation.status === "pending"
          ? "Already invited"
          : invitation.status === "accepted"
            ? "Already attending"
            : null,
    });
  }
  const pendingInvitees = new Set(
    invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => invitation.invitee_id),
  );
  for (const row of attendance) {
    if (row.requester_handle === null) {
      candidates.delete(row.user_id);
      continue;
    }
    candidates.set(row.user_id, {
      id: row.user_id,
      handle: row.requester_handle,
      displayName: row.requester_display_name,
      context: "Recent authorized person",
      eligible: row.status === "left" && !pendingInvitees.has(row.user_id),
      ineligibilityReason: pendingInvitees.has(row.user_id)
        ? "Already invited"
        : row.status === "left"
          ? null
          : row.status === "requested"
            ? "Attendance request already pending"
            : row.status === "approved"
              ? "Already attending"
              : "Current attendance state is not eligible",
    });
  }
  return [...candidates.values()];
}
