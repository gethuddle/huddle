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
import { GroupDiscoveryProgress } from "@/features/groups/components/group-discovery-progress";
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
import { getGroupDiscoveryProgress } from "@/features/groups/discovery";
import { getGroupOverviewAttention } from "@/features/groups/management";
import { groupMemberListQuerySchema, groupRouteSlugSchema } from "@/features/groups/schemas";
import { listPeopleHub } from "@/features/people/search";

export const metadata: Metadata = {
  title: "Supporter group — Huddle",
};

type GroupPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function GroupPage({ params, searchParams }: GroupPageProps) {
  const [routeParams, rawQuery] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ]);
  const parsedSlug = groupRouteSlugSchema.safeParse(routeParams.slug);
  if (!parsedSlug.success) notFound();
  const query = groupMemberListQuerySchema.parse({
    membersPage: Array.isArray(rawQuery.membersPage)
      ? rawQuery.membersPage[0]
      : rawQuery.membersPage,
  });

  const group = await getGroupDetail(parsedSlug.data, query.membersPage);
  if (group === null) notFound();
  const canManage = group.viewerRole === "owner" || group.viewerRole === "admin";
  const [events, progress, attention, shareCandidates] = await Promise.all([
    listGroupEvents(group.id),
    canManage ? getGroupDiscoveryProgress(group.id) : Promise.resolve(null),
    getGroupOverviewAttention(group),
    canManage && group.visibility === "unlisted"
      ? loadShareCandidates()
      : Promise.resolve<GroupShareCandidate[]>([]),
  ]);

  return (
    <section className="py-12 sm:py-16">
      {rawQuery.created === "1" ? (
        <Alert className="mb-6 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-court-hover">
            {group.visibility === "discoverable"
              ? "Your group is ready. It now lives in My Huddle; share the application link and review requests here."
              : "Your group is ready. It now lives in My Huddle; create controlled invitation links for the people you choose."}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-hidden rounded-[2rem] border border-border-dark bg-surface-raised shadow-2xl shadow-black/20">
        <div className="h-2 bg-court" />
        <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_19rem]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{group.visibility}</Badge>
              {group.viewerRole === null ? null : (
                <Badge variant="secondary">Your role: {group.viewerRole}</Badge>
              )}
              {group.viewerRole === null && group.viewerMembershipStatus !== null ? (
                <Badge variant="secondary">Application: {group.viewerMembershipStatus}</Badge>
              ) : null}
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
              {group.name}
            </h1>
            <p className="mt-5 max-w-2xl whitespace-pre-wrap text-lg leading-8 text-muted-dark">
              {group.description ?? "This group has not added a description yet."}
            </p>

            <dl className="mt-8 grid gap-5 border-y border-border-dark py-6 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">
                  City
                </dt>
                <dd className="mt-2 font-semibold text-linen">{group.cityName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">
                  Team
                </dt>
                <dd className="mt-2 font-semibold text-linen">{group.teamName ?? "Multi-team"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">
                  Active members
                </dt>
                <dd className="mt-2 font-semibold text-linen">{group.activeMemberCount}</dd>
              </div>
            </dl>

            <p className="mt-6 text-sm text-muted-dark">
              Owned by{" "}
              <Link
                className="font-semibold text-linen hover:text-court"
                href={`/people/${group.ownerHandle}`}
              >
                @{group.ownerHandle}
              </Link>
            </p>
          </div>

          <aside aria-label="Group status" className="self-start">
            <Card className="bg-surface-deep" size="sm">
              <CardHeader>
                <CardTitle className="text-linen">
                  {statusTitle(group.visibility, group.lifecycle)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-dark">
                  {statusDescription(group.visibility, group.lifecycle)}
                </p>
                {group.viewerMembershipStatus === "pending" ? (
                  <p className="mt-4 text-sm font-semibold leading-6 text-court-hover">
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

      {progress === null ? null : (
        <GroupDiscoveryProgress
          description={group.description}
          groupId={group.id}
          groupSlug={group.slug}
          progress={progress}
          visibility={group.visibility}
        />
      )}

      {attention.applications.length === 0 ? null : (
        <section aria-labelledby="group-applications-heading" className="mt-10">
          <h2 className="text-2xl font-semibold text-linen" id="group-applications-heading">
            Applications to review
          </h2>
          <div className="mt-5 space-y-3">
            {attention.applications.map((application) => (
              <div
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
                key={application.userId}
              >
                <div>
                  <Link className="font-semibold text-linen" href={`/people/${application.handle}`}>
                    {application.displayName}
                  </Link>
                  <p className="mt-1 text-sm text-muted-dark">
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
          <h2 className="text-2xl font-semibold text-linen" id="group-event-submissions-heading">
            Event submissions to review
          </h2>
          <div className="mt-5 space-y-3">
            {attention.events.map((event) => (
              <div
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
                key={event.id}
              >
                <div>
                  <Link className="font-semibold text-linen" href={`/events/${event.id}`}>
                    {event.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-dark">
                    {event.match.homeTeamName} vs {event.match.awayTeamName} · submitted by @
                    {event.submitterHandle}
                  </p>
                </div>
                <EventReviewControl
                  eventId={event.id}
                  eventTitle={event.title}
                  groupId={group.id}
                  groupSlug={group.slug}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {group.canApply ? (
        <section aria-labelledby="group-application-heading" className="mt-10">
          <Card>
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
                Reviewed membership
              </p>
              <CardTitle className="mt-2 text-2xl text-linen">
                <h2 id="group-application-heading">Apply to join</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-6 max-w-3xl text-sm leading-6 text-muted-dark">
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
            Shared expectations
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-linen" id="group-rules-heading">
            Group rules
          </h2>
          <ol className="mt-5 space-y-3">
            {group.rules
              .filter((rule) => rule.publishedAt !== null)
              .map((rule) => (
                <li
                  className="rounded-xl border border-border bg-surface-raised px-5 py-4 leading-7 text-muted-dark"
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
            Reviewed gatherings
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-linen" id="group-events-heading">
            Approved future events
          </h2>
          {events.length === 0 ? (
            <p className="mt-4 text-sm text-muted-dark">
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
                Protected member content
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-linen" id="group-members-heading">
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
                        className="font-semibold text-linen hover:text-court"
                        href={`/people/${member.handle}`}
                      >
                        {member.displayName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-dark">@{member.handle}</p>
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
                  <span className="px-4 text-sm text-muted-dark">
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

function statusTitle(visibility: "discoverable" | "unlisted", lifecycle: string): string {
  if (visibility === "unlisted") return "Shared by invitation";
  return lifecycle === "forming" ? "Not listed yet" : "Open for applications";
}

function statusDescription(visibility: "discoverable" | "unlisted", lifecycle: string): string {
  if (visibility === "unlisted") {
    return "This group stays out of search. Owners and admins share controlled invitation links.";
  }
  if (lifecycle === "forming") {
    return "Add a clear description to make this group searchable. Until then, only active members can open it.";
  }
  return "Supporters can find this page and apply. Member-only content stays protected.";
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
        person.friendship?.status === "accepted"
          ? `Friend · ${person.cityName}`
          : `${person.reason ?? "Suggested supporter"} · ${person.cityName}`,
    });
  }
  return [...candidates.values()];
}
