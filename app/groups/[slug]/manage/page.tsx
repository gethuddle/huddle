import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
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
import {
  ApplicationReviewControl,
  BanMemberControl,
  EventReviewControl,
  InviteCreateControl,
  InviteRevocationControl,
  MemberRoleControl,
  RuleCreateControl,
  RuleEditControl,
  RuleOrderButton,
  UnbanMemberControl,
} from "@/features/groups/components/group-management-controls";
import { GroupDiscoveryProgress } from "@/features/groups/components/group-discovery-progress";
import { getGroupDiscoveryProgress } from "@/features/groups/discovery";
import { getGroupManagement } from "@/features/groups/management";
import {
  groupManagementQuerySchema,
  groupRouteSlugSchema,
  type GroupManagementSection,
} from "@/features/groups/schemas";

export const metadata: Metadata = {
  title: "Manage supporter group — Huddle",
};

type GroupManagementPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const SECTION_LABELS = {
  events: "Event reviews",
  applications: "Applications",
  members: "Members",
  invites: "Invitations",
  bans: "Bans",
  rules: "Rules",
} satisfies Record<GroupManagementSection, string>;

export default async function GroupManagementPage({
  params,
  searchParams,
}: GroupManagementPageProps) {
  const [routeParams, rawQuery] = await Promise.all([params, searchParams]);
  const slug = groupRouteSlugSchema.safeParse(routeParams.slug);
  if (!slug.success) notFound();
  const query = groupManagementQuerySchema.parse({
    section: Array.isArray(rawQuery.section) ? rawQuery.section[0] : rawQuery.section,
    page: Array.isArray(rawQuery.page) ? rawQuery.page[0] : rawQuery.page,
  });
  const result = await getGroupManagement(slug.data, query.section, query.page);
  if (result === null) notFound();
  const discoveryProgress = await getGroupDiscoveryProgress(result.group.id);

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Group administration
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Manage {result.group.name}.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-dark">
            Review every applicant, keep invitation secrets short-lived, and use the role hierarchy
            to protect the group without gaining any platform-moderation authority.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${result.group.slug}`}>Back to group</Link>
        </Button>
      </div>

      <GroupDiscoveryProgress
        description={result.group.description}
        groupId={result.group.id}
        groupSlug={result.group.slug}
        progress={discoveryProgress}
        visibility={result.group.visibility}
      />

      <nav aria-label="Group administration sections" className="mt-10 flex flex-wrap gap-2">
        {(Object.keys(SECTION_LABELS) as GroupManagementSection[]).map((section) => (
          <Button
            asChild
            key={section}
            variant={section === result.section ? "default" : "outline"}
          >
            <Link
              aria-current={section === result.section ? "page" : undefined}
              href={`?section=${section}`}
            >
              {SECTION_LABELS[section]}
            </Link>
          </Button>
        ))}
      </nav>

      <div className="mt-8">
        {result.section === "events" ? <EventSubmissions result={result} /> : null}
        {result.section === "applications" ? <Applications result={result} /> : null}
        {result.section === "members" ? <Members result={result} /> : null}
        {result.section === "invites" ? <Invites result={result} /> : null}
        {result.section === "bans" ? <Bans result={result} /> : null}
        {result.section === "rules" ? <Rules result={result} /> : null}
      </div>

      {result.pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={result.page <= 1}
                className={result.page <= 1 ? "pointer-events-none opacity-50" : undefined}
                href={`?section=${result.section}&page=${Math.max(1, result.page - 1)}`}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-dark">
                Page {result.page} of {result.pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={result.page >= result.pageCount}
                className={
                  result.page >= result.pageCount ? "pointer-events-none opacity-50" : undefined
                }
                href={`?section=${result.section}&page=${Math.min(result.pageCount, result.page + 1)}`}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}

type ResultFor<Section extends GroupManagementSection> = Extract<
  NonNullable<Awaited<ReturnType<typeof getGroupManagement>>>,
  { section: Section }
>;

function EventSubmissions({ result }: Readonly<{ result: ResultFor<"events"> }>) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        description="Active members may submit a fixture event for review. Nothing publishes until an owner or administrator approves it."
        headingLevel="h2"
        title="No group event submissions."
      />
    );
  }

  return (
    <div className="space-y-4">
      {result.items.map((event) => (
        <Card key={event.id} size="sm">
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="font-semibold text-linen hover:text-court"
                  href={`/events/${event.id}`}
                >
                  {event.title}
                </Link>
                <Badge variant={event.status === "pending_group_review" ? "secondary" : "outline"}>
                  {event.status.replaceAll("_", " ")}
                </Badge>
                <Badge variant="outline">{event.audience.replaceAll("_", " ")}</Badge>
                <Badge variant="outline">{event.placeKind.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-3 font-semibold text-linen">
                {event.match.homeTeamName} vs {event.match.awayTeamName}
              </p>
              <p className="mt-1 text-sm text-muted-dark">
                {event.match.competitionName} · {formatDate(event.startsAt)}
              </p>
              <p className="mt-3 text-xs text-muted-dark">
                Submitted by {event.submitterDisplayName} (@{event.submitterHandle}) on{" "}
                {formatDate(event.submittedAt)}
              </p>
              {event.audienceGroupName === null ? null : (
                <p className="mt-2 text-xs text-muted-dark">
                  Audience group: {event.audienceGroupName}
                </p>
              )}
            </div>
            {event.status === "pending_group_review" ? (
              <EventReviewControl
                eventId={event.id}
                eventTitle={event.title}
                groupId={result.group.id}
                groupSlug={result.group.slug}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Applications({ result }: Readonly<{ result: ResultFor<"applications"> }>) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        description="Discoverable and invitation-backed requests will wait here until an owner or admin decides each one."
        headingLevel="h2"
        title="No pending applications."
      />
    );
  }

  return (
    <div className="space-y-4">
      {result.items.map((application) => (
        <Card key={application.userId} size="sm">
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="font-semibold text-linen hover:text-court"
                  href={`/people/${application.handle}`}
                >
                  {application.displayName}
                </Link>
                <Badge variant="outline">{application.source}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-dark">
                @{application.handle} · applied {formatDate(application.appliedAt)}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-dark">
                {application.message ?? "No application note provided."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <ApplicationReviewControl
                groupId={result.group.id}
                groupSlug={result.group.slug}
                userId={application.userId}
              />
              <BanMemberControl
                groupId={result.group.id}
                groupSlug={result.group.slug}
                targetLabel={`@${application.handle}`}
                userId={application.userId}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Members({ result }: Readonly<{ result: ResultFor<"members"> }>) {
  return (
    <div className="space-y-4">
      {result.items.map((member) => {
        const canChangeRole = result.group.viewerRole === "owner" && member.role !== "owner";
        const canBan =
          member.role !== "owner" &&
          (result.group.viewerRole === "owner" ||
            (result.group.viewerRole === "admin" && member.role === "member"));
        return (
          <Card key={member.userId} size="sm">
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-semibold text-linen hover:text-court"
                    href={`/people/${member.handle}`}
                  >
                    {member.displayName}
                  </Link>
                  <Badge variant={member.role === "owner" ? "secondary" : "outline"}>
                    {member.role}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-dark">
                  @{member.handle} · active since {formatDate(member.memberSince)}
                </p>
              </div>
              {canChangeRole || canBan ? (
                <div className="flex flex-wrap items-start gap-3 lg:justify-end">
                  {canChangeRole ? (
                    <MemberRoleControl
                      currentRole={member.role as "admin" | "member"}
                      groupId={result.group.id}
                      groupSlug={result.group.slug}
                      userId={member.userId}
                    />
                  ) : null}
                  {canBan ? (
                    <BanMemberControl
                      groupId={result.group.id}
                      groupSlug={result.group.slug}
                      targetLabel={`@${member.handle}`}
                      userId={member.userId}
                    />
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Invites({ result }: Readonly<{ result: ResultFor<"invites"> }>) {
  if (result.group.visibility !== "unlisted") {
    return (
      <EmptyState
        description="Discoverable groups accept direct applications from eligible signed-in supporters. Secret invitations are reserved for active unlisted groups."
        headingLevel="h2"
        title="Invitations are not used here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-linen">
            <h2>Create a one-time-visible invitation</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InviteCreateControl groupId={result.group.id} groupSlug={result.group.slug} />
        </CardContent>
      </Card>
      {result.items.length === 0 ? (
        <EmptyState
          description="Create a short-lived, use-limited link when an eligible supporter needs to request access."
          headingLevel="h2"
          title="No invitation history yet."
        />
      ) : (
        <div className="space-y-4">
          {result.items.map((invite) => {
            return (
              <Card key={invite.id} size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={invite.status === "active" ? "secondary" : "outline"}>
                        {invite.status}
                      </Badge>
                      <span className="font-semibold text-linen">
                        {invite.useCount} / {invite.maxUses} uses
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-dark">
                      Created by @{invite.creatorHandle} · expires {formatDate(invite.expiresAt)}
                    </p>
                  </div>
                  {invite.revokedAt === null ? (
                    <InviteRevocationControl
                      groupId={result.group.id}
                      groupSlug={result.group.slug}
                      inviteId={invite.id}
                    />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bans({ result }: Readonly<{ result: ResultFor<"bans"> }>) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        description="A ban immediately removes protected access and blocks future invitations or applications until revoked."
        headingLevel="h2"
        title="No active group bans."
      />
    );
  }

  return (
    <div className="space-y-4">
      {result.items.map((ban) => (
        <Card key={ban.userId} size="sm">
          <CardContent className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <Link
                className="font-semibold text-linen hover:text-court"
                href={`/people/${ban.handle}`}
              >
                {ban.displayName}
              </Link>
              <p className="mt-1 text-xs text-muted-dark">
                @{ban.handle} · banned by @{ban.bannedByHandle} on {formatDate(ban.bannedAt)}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-dark">
                {ban.reason}
              </p>
            </div>
            <UnbanMemberControl
              groupId={result.group.id}
              groupSlug={result.group.slug}
              userId={ban.userId}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Rules({ result }: Readonly<{ result: ResultFor<"rules"> }>) {
  const orderedRuleIds = result.items.map((rule) => rule.id);
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-linen">
            <h2>Add a group rule</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RuleCreateControl groupId={result.group.id} groupSlug={result.group.slug} />
        </CardContent>
      </Card>
      {result.items.length === 0 ? (
        <EmptyState
          description="Draft rules remain administrator-only. Publish a rule when every visible group visitor should read it."
          headingLevel="h2"
          title="No group rules yet."
        />
      ) : (
        <ol className="space-y-4">
          {result.items.map((rule, index) => (
            <li key={rule.id}>
              <Card size="sm">
                <CardContent className="grid gap-5 lg:grid-cols-[auto_1fr]">
                  <div className="flex items-start gap-2 lg:flex-col">
                    <Badge variant={rule.publishedAt === null ? "outline" : "secondary"}>
                      {rule.publishedAt === null ? "draft" : "published"}
                    </Badge>
                    {index > 0 ? (
                      <RuleOrderButton
                        direction="up"
                        groupId={result.group.id}
                        groupSlug={result.group.slug}
                        orderedRuleIds={orderedRuleIds}
                        ruleIndex={index}
                      />
                    ) : null}
                    {index < result.items.length - 1 ? (
                      <RuleOrderButton
                        direction="down"
                        groupId={result.group.id}
                        groupSlug={result.group.slug}
                        orderedRuleIds={orderedRuleIds}
                        ruleIndex={index}
                      />
                    ) : null}
                  </div>
                  <RuleEditControl
                    groupId={result.group.id}
                    groupSlug={result.group.slug}
                    published={rule.publishedAt !== null}
                    ruleId={rule.id}
                    text={rule.text}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(value));
}
