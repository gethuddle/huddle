import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  ApplicationReviewControl,
  ArchiveGroupControl,
  BanMemberControl,
  DirectInvitationRevocationControl,
  EventReviewControl,
  InviteRevocationControl,
  MemberRoleControl,
  RemoveMemberControl,
  RuleCreateControl,
  RuleEditControl,
  RuleOrderButton,
  UnbanMemberControl,
} from "@/features/groups/components/group-management-controls";
import { GroupSettingsForm } from "@/features/groups/components/group-settings-form";
import {
  getGroupManagement,
  getGroupSettings,
  type GroupManagementResult,
  type GroupSettings,
} from "@/features/groups/management";
import { groupManagementQuerySchema, groupRouteSlugSchema } from "@/features/groups/schemas";
import { collectionHasOverflow, collectionPageCount, collectionPageInput } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "Group settings — Huddle",
};

type GroupManagementPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function GroupManagementPage({
  params,
  searchParams,
}: GroupManagementPageProps) {
  const [routeParams, rawQuery] = await Promise.all([params, searchParams]);
  const slug = groupRouteSlugSchema.safeParse(routeParams.slug);
  if (!slug.success) notFound();
  const requestedSection = firstValue(rawQuery.section);
  if (requestedSection === "applications" || requestedSection === "events") {
    const queueQuery = groupManagementQuerySchema.parse({
      section: requestedSection,
      page: firstValue(rawQuery.page),
    });
    const queue = await getGroupManagement(slug.data, queueQuery.section, queueQuery.page);
    if (queue === null) notFound();
    return <GroupReviewQueue queue={queue} />;
  }
  const membersPage = pageValue(rawQuery.membersPage);
  const bansPage = pageValue(rawQuery.bansPage);
  const invitationsPage = pageValue(rawQuery.invitationsPage);
  const inviteLinksPage = pageValue(rawQuery.inviteLinksPage);
  const settings = await getGroupSettings(slug.data, membersPage, bansPage, invitationsPage);
  if (settings === null) notFound();
  const inviteLinks = await getGroupManagement(slug.data, "invites", inviteLinksPage);
  if (inviteLinks === null || inviteLinks.section !== "invites") notFound();

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-forest">Group settings</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            {settings.group.name}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Keep members, rules, and sharing choices in one place. New applications and event
            submissions stay on the group overview where they can be handled in context.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${settings.group.slug}`}>Back to group</Link>
        </Button>
      </div>

      <nav aria-label="Group settings" className="mt-8 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="#members">Members</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="#rules">Rules</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="#visibility">Visibility</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="#invite-links">Secure links</Link>
        </Button>
        {settings.directInvitations.items.length === 0 ? null : (
          <Button asChild variant="outline">
            <Link href="#invitations">Invitations</Link>
          </Button>
        )}
        {settings.group.viewerRole === "owner" ? (
          <Button asChild variant="outline">
            <Link href="#delete-group">Delete group</Link>
          </Button>
        ) : null}
        {settings.bans.items.length === 0 ? null : (
          <Button asChild variant="outline">
            <Link href="#bans">Bans</Link>
          </Button>
        )}
      </nav>

      <SettingsSection id="members" title="Members">
        <MemberSettings settings={settings} />
        <SettingsPagination
          groupSlug={settings.group.slug}
          page={settings.members.page}
          pageCount={settings.members.pageCount}
          parameter="membersPage"
          target="members"
        />
      </SettingsSection>

      <SettingsSection id="rules" title="Rules">
        <RuleSettings settings={settings} />
      </SettingsSection>

      <SettingsSection id="visibility" title="Visibility">
        <GroupSettingsForm
          description={settings.group.description}
          groupId={settings.group.id}
          groupSlug={settings.group.slug}
          visibility={settings.group.visibility}
        />
      </SettingsSection>

      <SettingsSection id="invite-links" title="Secure invitation links">
        <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-foreground">
          Link secrets appear only when they are created. This private list keeps the non-secret
          usage history and lets an owner or admin revoke an active link.
        </p>
        {inviteLinks.items.length === 0 ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            No secure invitation links have been created yet.
          </p>
        ) : (
          <div className="space-y-3">
            {inviteLinks.items.map((invite) => (
              <div
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
                key={invite.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">
                      {invite.useCount} of {invite.maxUses} uses
                    </p>
                    <Badge variant="outline">{invite.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Created {formatDate(invite.createdAt)} by {identityLabel(invite.creatorHandle)}
                    {" · "}Expires {formatDate(invite.expiresAt)}
                  </p>
                </div>
                {invite.status === "active" ? (
                  <InviteRevocationControl
                    groupId={settings.group.id}
                    groupSlug={settings.group.slug}
                    inviteId={invite.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
        <SettingsPagination
          groupSlug={settings.group.slug}
          hasOverflow={collectionHasOverflow(inviteLinks.totalCount)}
          page={inviteLinks.page}
          pageCount={collectionPageCount(inviteLinks.totalCount)}
          parameter="inviteLinksPage"
          target="invite-links"
        />
      </SettingsSection>

      {settings.directInvitations.items.length === 0 ? null : (
        <SettingsSection id="invitations" title="Direct invitations">
          <div className="space-y-3">
            {settings.directInvitations.items.map((invitation) => (
              <div
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
                key={invitation.id}
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {identityLabel(invitation.inviteeHandle, invitation.inviteeDisplayName)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {invitation.status === "pending"
                      ? `Waiting for a response · sent by ${identityLabel(invitation.inviterHandle)}`
                      : `${invitation.status} · sent by ${identityLabel(invitation.inviterHandle)}`}
                  </p>
                </div>
                {invitation.status === "pending" ? (
                  <DirectInvitationRevocationControl
                    groupId={settings.group.id}
                    groupSlug={settings.group.slug}
                    invitationId={invitation.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <SettingsPagination
            groupSlug={settings.group.slug}
            hasOverflow={settings.directInvitations.hasOverflow}
            page={settings.directInvitations.page}
            pageCount={settings.directInvitations.pageCount}
            parameter="invitationsPage"
            target="invitations"
          />
        </SettingsSection>
      )}

      {settings.bans.items.length === 0 ? null : (
        <SettingsSection id="bans" title="Bans">
          <p className="mb-5 text-sm leading-6 text-muted-foreground">
            Bans are explicit safety state. Revoking one does not restore membership; the supporter
            must apply again.
          </p>
          <BanSettings settings={settings} />
          <SettingsPagination
            groupSlug={settings.group.slug}
            page={settings.bans.page}
            pageCount={settings.bans.pageCount}
            parameter="bansPage"
            target="bans"
          />
        </SettingsSection>
      )}

      {settings.group.viewerRole === "owner" ? (
        <SettingsSection id="delete-group" title="Delete group">
          <div className="rounded-2xl border border-destructive/35 bg-destructive/5 p-5">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Delete this group when it should no longer appear or accept activity. Upcoming events
              and usable invite links will close; Huddle retains historical safety records.
            </p>
            <div className="mt-5">
              <ArchiveGroupControl
                groupId={settings.group.id}
                groupName={settings.group.name}
                groupSlug={settings.group.slug}
              />
            </div>
          </div>
        </SettingsSection>
      ) : null}
    </section>
  );
}

function GroupReviewQueue({ queue }: Readonly<{ queue: GroupManagementResult }>) {
  if (queue.section === "applications") {
    return (
      <QueueLayout
        groupName={queue.group.name}
        groupSlug={queue.group.slug}
        page={queue.page}
        pageCount={queue.pageCount}
        section="applications"
        title="Applications"
        totalCount={queue.totalCount}
      >
        {queue.items.map((application) => (
          <div
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
            key={application.userId}
          >
            <div>
              {application.handle === null ? (
                <p className="font-semibold text-foreground">Account unavailable</p>
              ) : (
                <Link
                  className="font-semibold text-foreground"
                  href={`/people/${application.handle}`}
                >
                  {application.displayName}
                </Link>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {application.handle === null ? "Account unavailable" : `@${application.handle}`} ·{" "}
                {application.source === "invite" ? "Invitation" : "Group page"}
              </p>
            </div>
            <ApplicationReviewControl
              groupId={queue.group.id}
              groupSlug={queue.group.slug}
              userId={application.userId}
            />
          </div>
        ))}
      </QueueLayout>
    );
  }

  if (queue.section === "events") {
    return (
      <QueueLayout
        groupName={queue.group.name}
        groupSlug={queue.group.slug}
        page={queue.page}
        pageCount={queue.pageCount}
        section="events"
        title="Event submissions"
        totalCount={queue.totalCount}
      >
        {queue.items.map((event) => (
          <article
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
            key={event.id}
          >
            <div>
              <Link className="font-semibold text-foreground" href={`/events/${event.id}`}>
                {event.title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.match.homeTeamName} vs {event.match.awayTeamName} · submitted by{" "}
                {event.submitterHandle === null
                  ? "Account unavailable"
                  : `@${event.submitterHandle}`}
              </p>
              <Badge className="mt-2" variant="outline">
                {event.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <EventReviewControl
              canReview={event.canReview}
              canWithdraw={event.canWithdraw}
              eventId={event.id}
              eventTitle={event.title}
              groupId={queue.group.id}
              groupSlug={queue.group.slug}
            />
          </article>
        ))}
      </QueueLayout>
    );
  }

  notFound();
}

function QueueLayout({
  children,
  groupName,
  groupSlug,
  page,
  pageCount,
  section,
  title,
  totalCount,
}: Readonly<{
  children: React.ReactNode;
  groupName: string;
  groupSlug: string;
  page: number;
  pageCount: number;
  section: "applications" | "events";
  title: string;
  totalCount: number;
}>) {
  const href = (nextPage: number) =>
    `/groups/${groupSlug}/manage?section=${section}&page=${nextPage}`;
  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-forest">Group administration</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {totalCount} {section === "events" ? "event submissions" : "applications"} for{" "}
            {groupName}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${groupSlug}/manage`}>Back to settings</Link>
        </Button>
      </div>
      <div className="mt-8 space-y-3">{children}</div>
      {pageCount <= 1 ? null : (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page <= 1}
                href={page <= 1 ? undefined : href(page - 1)}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-3 text-sm text-muted-foreground">
                {page}/{pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= pageCount}
                href={page >= pageCount ? undefined : href(page + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </section>
  );
}

function SettingsSection({
  children,
  id,
  title,
}: Readonly<{ children: React.ReactNode; id: string; title: string }>) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-10 scroll-mt-24" id={id}>
      <h2 className="text-2xl font-semibold text-foreground" id={`${id}-heading`}>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MemberSettings({ settings }: Readonly<{ settings: GroupSettings }>) {
  return (
    <div className="space-y-3">
      {settings.members.items.map((member) => {
        const canChangeRole = settings.group.viewerRole === "owner" && member.role !== "owner";
        const canBan =
          member.role !== "owner" &&
          (settings.group.viewerRole === "owner" ||
            (settings.group.viewerRole === "admin" && member.role === "member"));
        return (
          <div
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
            key={member.userId}
          >
            <div>
              {member.handle === null ? (
                <p className="font-semibold text-foreground">{identityLabel(member.handle)}</p>
              ) : (
                <Link className="font-semibold text-foreground" href={`/people/${member.handle}`}>
                  {member.displayName}
                </Link>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {identityLabel(member.handle)} · member since {formatDate(member.memberSince)}
              </p>
              <Badge className="mt-2" variant="outline">
                {member.role}
              </Badge>
            </div>
            {canChangeRole || canBan ? (
              <div className="flex flex-wrap items-start gap-3">
                {canChangeRole ? (
                  <MemberRoleControl
                    currentRole={member.role as "admin" | "member"}
                    groupId={settings.group.id}
                    groupSlug={settings.group.slug}
                    userId={member.userId}
                  />
                ) : null}
                {canBan ? (
                  <>
                    <RemoveMemberControl
                      groupId={settings.group.id}
                      groupSlug={settings.group.slug}
                      targetLabel={identityLabel(member.handle)}
                      userId={member.userId}
                    />
                    <BanMemberControl
                      groupId={settings.group.id}
                      groupSlug={settings.group.slug}
                      targetLabel={identityLabel(member.handle)}
                      userId={member.userId}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function RuleSettings({ settings }: Readonly<{ settings: GroupSettings }>) {
  const orderedRuleIds = settings.rules.map((rule) => rule.id);
  return (
    <div className="space-y-5">
      <RuleCreateControl groupId={settings.group.id} groupSlug={settings.group.slug} />
      {settings.rules.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          Add one clear rule for members and applicants.
        </p>
      ) : (
        <ol className="space-y-3">
          {settings.rules.map((rule, index) => (
            <li className="rounded-xl border border-border p-4" key={rule.id}>
              <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
                <div className="flex items-start gap-2 lg:flex-col">
                  <Badge variant={rule.publishedAt === null ? "outline" : "secondary"}>
                    {rule.publishedAt === null ? "Draft" : "Visible"}
                  </Badge>
                  {index > 0 ? (
                    <RuleOrderButton
                      direction="up"
                      groupId={settings.group.id}
                      groupSlug={settings.group.slug}
                      orderedRuleIds={orderedRuleIds}
                      ruleIndex={index}
                    />
                  ) : null}
                  {index < settings.rules.length - 1 ? (
                    <RuleOrderButton
                      direction="down"
                      groupId={settings.group.id}
                      groupSlug={settings.group.slug}
                      orderedRuleIds={orderedRuleIds}
                      ruleIndex={index}
                    />
                  ) : null}
                </div>
                <RuleEditControl
                  groupId={settings.group.id}
                  groupSlug={settings.group.slug}
                  published={rule.publishedAt !== null}
                  ruleId={rule.id}
                  text={rule.text}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BanSettings({ settings }: Readonly<{ settings: GroupSettings }>) {
  return (
    <div className="space-y-3">
      {settings.bans.items.map((ban) => (
        <div
          className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-destructive/30 p-4"
          key={ban.userId}
        >
          <div>
            {ban.handle === null ? (
              <p className="font-semibold text-foreground">{identityLabel(ban.handle)}</p>
            ) : (
              <Link className="font-semibold text-foreground" href={`/people/${ban.handle}`}>
                {ban.displayName}
              </Link>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {identityLabel(ban.handle)} · banned {formatDate(ban.bannedAt)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{ban.reason}</p>
          </div>
          <UnbanMemberControl
            groupId={settings.group.id}
            groupSlug={settings.group.slug}
            userId={ban.userId}
          />
        </div>
      ))}
    </div>
  );
}

function SettingsPagination({
  groupSlug,
  hasOverflow = false,
  page,
  pageCount,
  parameter,
  target,
}: Readonly<{
  groupSlug: string;
  hasOverflow?: boolean;
  page: number;
  pageCount: number;
  parameter: "membersPage" | "bansPage" | "invitationsPage" | "inviteLinksPage";
  target: string;
}>) {
  if (pageCount <= 1) return null;
  const href = (nextPage: number) =>
    `/groups/${groupSlug}/manage?${parameter}=${nextPage}#${target}`;
  return (
    <div className="mt-6">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              aria-disabled={page <= 1}
              href={page <= 1 ? undefined : href(page - 1)}
            />
          </PaginationItem>
          <PaginationItem>
            <span className="px-3 text-sm text-muted-foreground">
              {page}/{pageCount}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              aria-disabled={page >= pageCount}
              href={page >= pageCount ? undefined : href(page + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      {hasOverflow ? (
        <p className="mt-3 text-center text-sm text-muted-foreground" role="status">
          More invitations exist than can be shown in this list. This page stops at Huddle&apos;s
          safe browsing limit.
        </p>
      ) : null}
    </div>
  );
}

function pageValue(value: string | string[] | undefined) {
  return collectionPageInput(Array.isArray(value) ? value[0] : value).page;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IL", {
    dateStyle: "medium",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(value));
}

function identityLabel(handle: string | null, visibleName?: string) {
  if (handle === null) return "Account unavailable";
  return visibleName === undefined ? `@${handle}` : `${visibleName} · @${handle}`;
}
