import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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
import { GroupApplicationForm } from "@/features/groups/components/group-application-form";
import { GroupMembershipControl } from "@/features/groups/components/group-membership-control";
import { getGroupDetail } from "@/features/groups/detail";
import { groupMemberListQuerySchema, groupRouteSlugSchema } from "@/features/groups/schemas";

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

  return (
    <section className="py-12 sm:py-16">
      <div className="overflow-hidden rounded-[2rem] border border-border-dark bg-surface-raised shadow-2xl shadow-black/20">
        <div className="h-2 bg-court" />
        <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_19rem]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{group.visibility}</Badge>
              <Badge variant="outline">{group.lifecycle}</Badge>
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
                  <Button asChild className="mt-5 w-full">
                    <Link href={`/groups/${group.slug}/manage`}>Manage group</Link>
                  </Button>
                ) : null}
                {group.viewerRole === "member" || group.viewerRole === "admin" ? (
                  <div className="mt-5">
                    <GroupMembershipControl groupId={group.id} groupSlug={group.slug} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

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
  if (visibility === "unlisted") return "Unlisted and member-only";
  return lifecycle === "forming" ? "Forming and accepting applications" : "Public group summary";
}

function statusDescription(visibility: "discoverable" | "unlisted", lifecycle: string): string {
  if (visibility === "unlisted") {
    return "This group stays out of search. Only active members can open this summary and roster.";
  }
  if (lifecycle === "forming") {
    return "Eligible signed-in supporters with this direct link may read the safe summary and apply. It remains absent from public discovery until every activation threshold is met.";
  }
  return "Anyone may read this safe summary. Member-only content remains protected.";
}
