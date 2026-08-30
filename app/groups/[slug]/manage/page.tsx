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
  BanMemberControl,
  MemberRoleControl,
  RuleCreateControl,
  RuleEditControl,
  RuleOrderButton,
  UnbanMemberControl,
} from "@/features/groups/components/group-management-controls";
import { GroupSettingsForm } from "@/features/groups/components/group-settings-form";
import { getGroupSettings, type GroupSettings } from "@/features/groups/management";
import { groupRouteSlugSchema } from "@/features/groups/schemas";
import { collectionPageInput } from "@/lib/pagination";

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
  const membersPage = pageValue(rawQuery.membersPage);
  const bansPage = pageValue(rawQuery.bansPage);
  const settings = await getGroupSettings(slug.data, membersPage, bansPage);
  if (settings === null) notFound();

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-court">Group settings</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-5xl">
            {settings.group.name}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-dark">
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

      {settings.bans.items.length === 0 ? null : (
        <SettingsSection id="bans" title="Bans">
          <p className="mb-5 text-sm leading-6 text-muted-dark">
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
      <h2 className="text-2xl font-semibold text-linen" id={`${id}-heading`}>
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
              <Link className="font-semibold text-linen" href={`/people/${member.handle}`}>
                {member.displayName}
              </Link>
              <p className="mt-1 text-sm text-muted-dark">
                @{member.handle} · member since {formatDate(member.memberSince)}
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
                  <BanMemberControl
                    groupId={settings.group.id}
                    groupSlug={settings.group.slug}
                    targetLabel={`@${member.handle}`}
                    userId={member.userId}
                  />
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
        <p className="rounded-xl border border-border p-4 text-sm text-muted-dark">
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
            <Link className="font-semibold text-linen" href={`/people/${ban.handle}`}>
              {ban.displayName}
            </Link>
            <p className="mt-1 text-sm text-muted-dark">
              @{ban.handle} · banned {formatDate(ban.bannedAt)}
            </p>
            <p className="mt-2 text-sm text-muted-dark">{ban.reason}</p>
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
  page,
  pageCount,
  parameter,
  target,
}: Readonly<{
  groupSlug: string;
  page: number;
  pageCount: number;
  parameter: "membersPage" | "bansPage";
  target: string;
}>) {
  if (pageCount <= 1) return null;
  const href = (nextPage: number) =>
    `/groups/${groupSlug}/manage?${parameter}=${nextPage}#${target}`;
  return (
    <Pagination className="mt-6">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={page <= 1}
            href={page <= 1 ? undefined : href(page - 1)}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-3 text-sm text-muted-dark">
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
  );
}

function pageValue(value: string | string[] | undefined) {
  return collectionPageInput(Array.isArray(value) ? value[0] : value).page;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IL", {
    dateStyle: "medium",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(value));
}
