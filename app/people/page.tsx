import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { requireActor } from "@/features/auth/actor";
import { FriendshipControl } from "@/features/friendships/components/friendship-control";
import { peopleSearchQuerySchema, searchPeople } from "@/features/people/search";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { DomainError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Find people — Huddle",
  description: "Find another Huddle member by their name or handle.",
};

type PeoplePageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  try {
    await requireActor("community");
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in"
          actionLabel="Sign in"
          description="People search is available to verified Huddle members."
          eyebrow="Sign in required"
          title="Sign in to find people."
        />
      );
    }
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") {
      return (
        <ProfileAccessState
          actionHref="/settings/profile"
          actionLabel="Finish profile"
          description="Complete your verified profile before connecting with other members."
          eyebrow="Profile required"
          title="Finish joining before finding people."
          warning={error.code === "ACCOUNT_SUSPENDED"}
        />
      );
    }
    throw error;
  }

  const raw = await searchParams;
  const rawQuery = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const rawPage = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const parsed = peopleSearchQuerySchema.safeParse({ q: rawQuery, page: rawPage });
  const result = parsed.success ? await searchPeople(parsed.data.q, parsed.data.page) : null;
  const typedQuery = typeof rawQuery === "string" ? rawQuery : "";

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Huddle directory
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Find people.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Search by display name or handle, then open a safe profile or send a direct friend
            request. Blocked accounts never appear in results.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings/friends">Friend requests</Link>
        </Button>
      </div>

      <form
        action="/people"
        className="mt-10 rounded-2xl border border-border-dark bg-surface-raised p-5"
        method="get"
      >
        <Label htmlFor="people-query">Name or Huddle handle</Label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Input
            defaultValue={typedQuery}
            id="people-query"
            maxLength={50}
            minLength={2}
            name="q"
            placeholder="Try a name or @handle"
            required
          />
          <Button type="submit">Search people</Button>
        </div>
        {typedQuery.length > 0 && !parsed.success ? (
          <p className="mt-3 text-sm text-sand">Enter at least two characters.</p>
        ) : (
          <p className="mt-3 text-xs text-muted-dark">
            Results show only safe profile details: name, handle and city.
          </p>
        )}
      </form>

      {result === null ? (
        <EmptyState
          description="Search for someone you met at a match or ask them for their Huddle handle."
          headingLevel="h2"
          title="Who are you looking for?"
        />
      ) : result.items.length === 0 ? (
        <EmptyState
          description="Check the spelling or try their Huddle handle."
          headingLevel="h2"
          title="No matching people found."
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-muted-dark">
            {result.totalCount} {result.totalCount === 1 ? "person" : "people"} found
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {result.items.map((person) => (
              <Card key={person.handle} size="sm">
                <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="text-lg font-semibold text-linen hover:text-court"
                        href={`/people/${person.handle}`}
                      >
                        {person.displayName}
                      </Link>
                      <Badge variant="outline">{person.cityName}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-dark">@{person.handle}</p>
                  </div>
                  <FriendshipControl
                    initialFriendship={person.friendship}
                    targetHandle={person.handle}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {parsed.success && result !== null && result.pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={parsed.data.page <= 1}
                href={
                  parsed.data.page <= 1
                    ? undefined
                    : `/people?q=${encodeURIComponent(parsed.data.q)}&page=${parsed.data.page - 1}`
                }
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-dark">
                Page {parsed.data.page} of {result.pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={parsed.data.page >= result.pageCount}
                href={
                  parsed.data.page >= result.pageCount
                    ? undefined
                    : `/people?q=${encodeURIComponent(parsed.data.q)}&page=${parsed.data.page + 1}`
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}
