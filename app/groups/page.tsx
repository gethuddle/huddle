import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { listMyGroupsForViewer } from "@/features/dashboard/queries";
import { getDiscoveryCatalog } from "@/features/discovery/catalog";
import { ExploreTabs } from "@/features/discovery/components/explore-tabs";
import { GroupCard } from "@/features/groups/components/group-card";
import { GroupSearchFilters } from "@/features/groups/components/group-search-filters";
import { getGroupSearchPage } from "@/features/groups/search";
import { groupSearchParams, parseGroupSearchFilters } from "@/features/groups/search-schemas";

export const metadata: Metadata = {
  title: "Groups — Huddle",
  description: "Find active, discoverable groups by name or team.",
};

type GroupsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const filters = parseGroupSearchFilters(await searchParams);
  const [catalog, page, myGroups] = await Promise.all([
    getDiscoveryCatalog(),
    getGroupSearchPage(filters),
    listMyGroupsForViewer(),
  ]);

  return (
    <section className="py-12 sm:py-16">
      <ExploreTabs current="groups" />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-forest">Find your people</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            Find a group that fits.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            Search groups by name and narrow by team when a group follows one. Your location never
            limits which communities you can join. Unlisted groups stay out of these results.
          </p>
        </div>
        <Button asChild>
          <Link href="/groups/new">Create a group</Link>
        </Button>
      </div>

      {myGroups.length > 0 ? (
        <section aria-labelledby="my-groups-heading" className="mt-10 border-t border-border pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-forest">Your groups</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground" id="my-groups-heading">
                Pick up where you left off
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Groups you are setting up and unlisted groups appear here even though they stay out
                of public search.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">Open My Huddle</Link>
            </Button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myGroups.map((group) => (
              <Card className="h-full" key={group.group_id} size="sm">
                <CardHeader>
                  <p className="text-xs text-muted-foreground">
                    {group.member_role} ·{" "}
                    {group.visibility === "unlisted" ? "Private" : "Discoverable"} · Ready
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">{group.name}</h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {group.active_member_count} active members
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/groups/${group.slug}`}>Open group</Link>
                    </Button>
                    {group.can_manage ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/groups/${group.slug}/manage`}>Manage</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-10">
        <GroupSearchFilters catalog={catalog} filters={filters} />
      </div>

      <section aria-label="Public group search results">
        {page.items.length === 0 ? (
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href="/groups">Clear filters</Link>
              </Button>
            }
            description="Try another team or group name. Unlisted groups appear only through invitation links."
            headingLevel="h2"
            title="No active groups match these filters."
          />
        ) : (
          <>
            <div className="mt-10 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Discoverable</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">Groups</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {page.items.map((group) => (
                <GroupCard group={group} key={group.id} />
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              {page.nextCursor === null ? (
                <p className="text-sm text-muted-foreground">You reached the end of the list.</p>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/groups?${groupSearchParams(filters, page.nextCursor)}`}>
                    Next groups
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
