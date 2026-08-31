import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EventCard } from "@/features/events/components/event-card";
import { listGroupEvents } from "@/features/events/queries";
import { GroupApplicationForm } from "@/features/groups/components/group-application-form";
import {
  ApplicationReviewControl,
  EventReviewControl,
} from "@/features/groups/components/group-management-controls";
import { GroupMembershipControl } from "@/features/groups/components/group-membership-control";
import {
  GroupShareDialog,
  type GroupShareCandidate,
} from "@/features/groups/components/group-share-dialog";
import { ReportControl } from "@/features/moderation/components/report-control";
import { getGroupDetail } from "@/features/groups/detail";
import { getGroupOverviewAttention } from "@/features/groups/management";
import { groupMemberListQuerySchema, groupRouteSlugSchema } from "@/features/groups/schemas";
import { listPeopleHub } from "@/features/people/search";
import { z } from "zod";

export const metadata: Metadata = {
  title: "Group — Huddle",
};

type GroupPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

const groupNoticeSchema = z
  .enum(["event-approved", "event-rejected", "event-withdrawn"])
  .nullable()
  .catch(null);

export default async function GroupPage({ params, searchParams }: GroupPageProps) {
  const [routeParams, rawQuery] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ]);
  const parsedSlug = groupRouteSlugSchema.safeParse(routeParams.slug);
  if (!parsedSlug.success) notFound();
  const notice = groupNoticeSchema.parse(
    Array.isArray(rawQuery.notice) ? rawQuery.notice[0] : rawQuery.notice,
  );
  const query = groupMemberListQuerySchema.parse({
    membersPage: Array.isArray(rawQuery.membersPage)
      ? rawQuery.membersPage[0]
      : rawQuery.membersPage,
  });

  const group = await getGroupDetail(parsedSlug.data, query.membersPage);
  if (group === null) notFound();
  const canManage = group.viewerRole === "owner" || group.viewerRole === "admin";
  const [events, attention, shareCandidates] = await Promise.all([
    listGroupEvents(group.id),
    getGroupOverviewAttention(group),
    canManage ? loadShareCandidates() : Promise.resolve<GroupShareCandidate[]>([]),
  ]);

  return (
    <section className="py-12 sm:py-16">
      {notice === null ? null : (
        <Alert className="mb-6 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-forest-hover">
            {notice === "event-approved"
              ? "Group event approved and published."
              : notice === "event-rejected"
                ? "Group event rejected and removed from the review queue."
                : "Event submission withdrawn and removed from the review queue."}
          </AlertDescription>
        </Alert>
      )}
      {rawQuery.created === "1" ? (
        <Alert className="mb-6 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-forest-hover">
            {group.visibility === "discoverable"
              ? "Your group is ready. It now lives in My Huddle; share the application link and review requests here."
              : "Your group is ready. It now lives in My Huddle; create controlled invitation links for the people you choose."}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-none">
        <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_19rem]">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                {group.visibility === "unlisted" ? "Private group" : "Discoverable group"}
              </span>
              {group.viewerRole === null ? null : <span>Your role: {group.viewerRole}</span>}
              {group.viewerRole === null && group.viewerMembershipStatus !== null ? (
                <span>Application: {group.viewerMembershipStatus}</span>
              ) : null}
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
              {group.name}
            </h1>
            <p className="mt-5 max-w-2xl whitespace-pre-wrap text-lg leading-8 text-muted-foreground">
              {group.description ?? "This group has not added a description yet."}
            </p>

            <dl className="mt-8 grid gap-5 border-y border-border py-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Team</dt>
                <dd className="mt-2 font-semibold text-foreground">
                  {group.teamName ?? "Multi-team"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Active members</dt>
                <dd className="mt-2 font-semibold text-foreground">{group.activeMemberCount}</dd>
              </div>
            </dl>

            <p className="mt-6 text-sm text-muted-foreground">
              Owned by{" "}
              <Link
                className="font-semibold text-foreground hover:text-forest"
                href={`/people/${group.ownerHandle}`}
              >
                @{group.ownerHandle}
              </Link>
            </p>
          </div>

          <aside aria-label="Group status" className="self-start">
            <Card className="bg-muted" size="sm">
              <CardHeader>
                <CardTitle className="text-foreground">{statusTitle(group.visibility)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {statusDescription(group.visibility)}
                </p>
                {group.viewerMembershipStatus === "pending" ? (
                  <p className="mt-4 text-sm font-semibold leading-6 text-forest-hover">
                    Your application is waiting for an owner or administrator to review it.
                  </p>
                ) : null}
                {group.viewerRole === "owner" || group.viewerRole === "admin" ? (
                  <div className="mt-5 space-y-2">
                    <Button asChild className="w-full">
                      <Link href={`/groups/${group.slug}/manage`}>Manage group</Link>
                    </Button>
                    <Button asChild className="w-full" variant="outline">
                      <Link href={`/events/new?group=${group.id}`}>Create group event</Link>
                    </Button>
                  </div>
                ) : null}
                {group.visibility === "discoverable" || canManage ? (
                  <div className="mt-3">
                    <GroupShareDialog
                      candidates={shareCandidates}
                      canManage={canManage}
                      groupId={group.id}
                      groupName={group.name}
                      groupSlug={group.slug}
                      visibility={group.visibility}
                    />
                  </div>
                ) : null}
                {group.viewerRole === "member" || group.viewerRole === "admin" ? (
                  <div className="mt-5">
                    <GroupMembershipControl groupId={group.id} groupSlug={group.slug} />
                  </div>
                ) : null}
                <div className="mt-5">
                  <ReportControl targetId={group.id} targetLabel={group.name} targetType="group" />
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {attention.applications.length === 0 ? null : (
        <section aria-labelledby="group-applications-heading" className="mt-10">
          <h2 className="text-2xl font-semibold text-foreground" id="group-applications-heading">
            Applications to review
          </h2>
          <div className="mt-5 space-y-3">
            {attention.applications.map((application) => (
              <div
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
                key={application.userId}
              >
                <div>
                  <Link
                    className="font-semibold text-foreground"
                    href={`/people/${application.handle}`}
                  >
                    {application.displayName}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    @{application.handle} ·{" "}
                    {application.source === "invite" ? "Invitation" : "Group page"}
                  </p>
                </div>
                <ApplicationReviewControl
                  groupId={group.id}
                  groupSlug={group.slug}
                  userId={application.userId}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {attention.events.length === 0 ? null : (
        <section aria-labelledby="group-event-submissions-heading" className="mt-10">
          <h2
            className="text-2xl font-semibold text-foreground"
            id="group-event-submissions-heading"
          >
            Event submissions to review
          </h2>
          <div className="mt-5 space-y-3">
            {attention.events.map((event) => (
              <article
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
                key={event.id}
              >
                <div>
                  <Link className="font-semibold text-foreground" href={`/events/${event.id}`}>
                    {event.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.match.homeTeamName} vs {event.match.awayTeamName} · submitted by @
                    {event.submitterHandle}
                  </p>
                </div>
                <EventReviewControl
                  canReview={event.canReview}
                  canWithdraw={event.canWithdraw}
                  eventId={event.id}
                  eventTitle={event.title}
                  groupId={group.id}
                  groupSlug={group.slug}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {group.canApply ? (
        <section aria-labelledby="group-application-heading" className="mt-10">
          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-forest">Reviewed membership</p>
              <CardTitle className="mt-2 text-2xl text-foreground">
                <h2 id="group-application-heading">Apply to join</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-6 max-w-3xl text-sm leading-6 text-muted-foreground">
                Every discoverable-group application waits for an active owner or administrator.
                Applying never creates an active membership automatically.
              </p>
              <GroupApplicationForm groupId={group.id} groupSlug={group.slug} />
            </CardContent>
          </Card>
        </section>
      ) : null}

      {group.rules.some((rule) => rule.publishedAt !== null) ? (
        <section aria-labelledby="group-rules-heading" className="mt-10">
          <p className="text-sm font-medium text-forest">Shared expectations</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground" id="group-rules-heading">
            Group rules
          </h2>
          <ol className="mt-5 space-y-3">
            {group.rules
              .filter((rule) => rule.publishedAt !== null)
              .map((rule) => (
                <li
                  className="rounded-xl border border-border bg-card px-5 py-4 leading-7 text-muted-foreground"
                  key={rule.id}
                >
                  {rule.text}
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      {events.length > 0 || group.canViewMemberContent ? (
        <section aria-labelledby="group-events-heading" className="mt-10">
          <p className="text-sm font-medium text-forest">Reviewed gatherings</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground" id="group-events-heading">
            Approved future events
          </h2>
          {events.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No approved future event is visible to you. Pending submissions remain
              administrator-only.
            </p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <EventCard event={event} key={event.id} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {group.canViewMemberContent ? (
        <section aria-labelledby="group-members-heading" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-forest">Protected member content</p>
              <h2
                className="mt-2 text-2xl font-semibold text-foreground"
                id="group-members-heading"
              >
                Active members
              </h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {group.members.map((member) => (
              <Card key={member.handle} size="sm">
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link
                        className="font-semibold text-foreground hover:text-forest"
                        href={`/people/${member.handle}`}
                      >
                        {member.displayName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">@{member.handle}</p>
                    </div>
                    <Badge variant="outline">{member.role}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {group.memberPageCount > 1 ? (
            <Pagination className="mt-8">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={group.memberPage <= 1}
                    className={group.memberPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                    href={`?membersPage=${Math.max(1, group.memberPage - 1)}#group-members-heading`}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-4 text-sm text-muted-foreground">
                    Page {group.memberPage} of {group.memberPageCount}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={group.memberPage >= group.memberPageCount}
                    className={
                      group.memberPage >= group.memberPageCount
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                    href={`?membersPage=${Math.min(group.memberPageCount, group.memberPage + 1)}#group-members-heading`}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function statusTitle(visibility: "discoverable" | "unlisted"): string {
  if (visibility === "unlisted") return "Shared by invitation";
  return "Open for applications";
}

function statusDescription(visibility: "discoverable" | "unlisted"): string {
  if (visibility === "unlisted") {
    return "This group stays out of search. Owners and admins share controlled invitation links.";
  }
  return "People can find this page and apply. Member-only content stays protected.";
}

async function loadShareCandidates(): Promise<GroupShareCandidate[]> {
  const [accepted, suggested] = await Promise.all([
    listPeopleHub("accepted", "", 1),
    listPeopleHub("suggested", "", 1),
  ]);
  const candidates = new Map<string, GroupShareCandidate>();
  for (const person of [...accepted.items, ...suggested.items]) {
    candidates.set(person.id, {
      id: person.id,
      handle: person.handle,
      displayName: person.displayName,
      context:
        person.friendship?.status === "accepted" ? "Friend" : (person.reason ?? "Suggested person"),
    });
  }
  return [...candidates.values()];
}
