import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGroupDetail } from "@/features/groups/detail";
import { groupRouteSlugSchema } from "@/features/groups/schemas";

export const metadata: Metadata = {
  title: "Supporter group — Huddle",
};

type GroupPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function GroupPage({ params }: GroupPageProps) {
  const routeParams = await params;
  const parsedSlug = groupRouteSlugSchema.safeParse(routeParams.slug);
  if (!parsedSlug.success) notFound();

  const group = await getGroupDetail(parsedSlug.data);
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
                {group.viewerRole === "owner" ? (
                  <p className="mt-4 text-xs leading-5 text-muted-dark">
                    Member applications, invites, roles, rules, and bans are not available in this
                    creation flow yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

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
        </section>
      ) : null}
    </section>
  );
}

function statusTitle(visibility: "discoverable" | "unlisted", lifecycle: string): string {
  if (visibility === "unlisted") return "Unlisted and member-only";
  return lifecycle === "forming" ? "Forming privately" : "Public group summary";
}

function statusDescription(visibility: "discoverable" | "unlisted", lifecycle: string): string {
  if (visibility === "unlisted") {
    return "This group stays out of search. Only active members can open this summary and roster.";
  }
  if (lifecycle === "forming") {
    return "This group is visible only to its active members until every discovery threshold is met.";
  }
  return "Anyone may read this safe summary. Member-only content remains protected.";
}
