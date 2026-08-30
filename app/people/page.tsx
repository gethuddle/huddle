import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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
import { fanRecovery } from "@/features/auth/fan-recovery";
import { FriendshipControl } from "@/features/friendships/components/friendship-control";
import {
  listPeopleHub,
  peopleSearchQuerySchema,
  type PeopleBucket,
  type PeopleHubItem,
  type PeopleHubPage,
} from "@/features/people/search";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { DomainError } from "@/lib/errors";
import { collectionPageInput } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "People — Huddle",
  description: "Find people and manage your Huddle friendships in one place.",
};

type PeoplePageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type PeoplePageState = Readonly<{
  query: string;
  searchPage: number;
  suggestedPage: number;
  friendsPage: number;
  incomingPage: number;
  sentPage: number;
}>;

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const raw = await searchParams;
  const focusedRelationship = first(raw.bucket) === "incoming" ? "incoming" : null;
  const rawQuery = first(raw.q);
  const parsedSearch = peopleSearchQuerySchema.safeParse({
    q: rawQuery,
    page: first(raw.searchPage),
  });
  const searchPageInput = collectionPageInput(first(raw.searchPage));
  const relationshipPageInputs = {
    suggested: collectionPageInput(first(raw.suggestedPage)),
    accepted: collectionPageInput(first(raw.friendsPage)),
    incoming: collectionPageInput(first(raw.incomingPage)),
    sent: collectionPageInput(first(raw.sentPage)),
  } as const;
  const pages = {
    suggested: relationshipPageInputs.suggested.page,
    accepted: relationshipPageInputs.accepted.page,
    incoming: relationshipPageInputs.incoming.page,
    sent: relationshipPageInputs.sent.page,
  } as const;

  if (parsedSearch.success && searchPageInput.wasAboveWindow) {
    redirect(
      peopleHref(
        {
          query: parsedSearch.data.q,
          searchPage: searchPageInput.page,
          suggestedPage: pages.suggested,
          friendsPage: pages.accepted,
          incomingPage: pages.incoming,
          sentPage: pages.sent,
        },
        "search",
      ),
    );
  }
  if (
    !parsedSearch.success &&
    Object.values(relationshipPageInputs).some((input) => input.wasAboveWindow)
  ) {
    const anchor = relationshipPageInputs.suggested.wasAboveWindow
      ? "suggested"
      : relationshipPageInputs.accepted.wasAboveWindow
        ? "accepted"
        : relationshipPageInputs.incoming.wasAboveWindow
          ? "incoming"
          : "sent";
    redirect(
      peopleHref(
        {
          query: "",
          searchPage: 1,
          suggestedPage: pages.suggested,
          friendsPage: pages.accepted,
          incomingPage: pages.incoming,
          sentPage: pages.sent,
        },
        anchor,
      ),
    );
  }

  let hub: Readonly<{
    suggested: PeopleHubPage | null;
    accepted: PeopleHubPage | null;
    incoming: PeopleHubPage | null;
    sent: PeopleHubPage | null;
    search: PeopleHubPage | null;
  }>;
  try {
    await requireActor("fan");
    if (parsedSearch.success) {
      hub = {
        search: await listPeopleHub("search", parsedSearch.data.q, parsedSearch.data.page),
        suggested: null,
        accepted: null,
        incoming: null,
        sent: null,
      };
    } else {
      const [suggested, accepted, incoming, sent] = await Promise.all([
        listPeopleHub("suggested", "", pages.suggested),
        listPeopleHub("accepted", "", pages.accepted),
        listPeopleHub("incoming", "", pages.incoming),
        listPeopleHub("sent", "", pages.sent),
      ]);
      hub = { suggested, accepted, incoming, sent, search: null };
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in"
          actionLabel="Sign in"
          description="People is available to verified Huddle members."
          eyebrow="Sign in required"
          title="Sign in to find people."
        />
      );
    }
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") {
      return <ProfileAccessState {...fanRecovery(error.code)} />;
    }
    throw error;
  }

  const activeQuery = parsedSearch.success ? parsedSearch.data.q : "";
  const attemptedQuery = typeof rawQuery === "string" ? rawQuery.slice(0, 50) : "";
  const requestedState: PeoplePageState = {
    query: activeQuery,
    searchPage: parsedSearch.success ? parsedSearch.data.page : 1,
    suggestedPage: pages.suggested,
    friendsPage: pages.accepted,
    incomingPage: pages.incoming,
    sentPage: pages.sent,
  };
  const canonicalState: PeoplePageState = {
    query: activeQuery,
    searchPage: hub.search?.page ?? 1,
    suggestedPage: hub.suggested?.page ?? 1,
    friendsPage: hub.accepted?.page ?? 1,
    incomingPage: hub.incoming?.page ?? 1,
    sentPage: hub.sent?.page ?? 1,
  };
  const mismatchedSection = canonicalPeopleSection(
    requestedState,
    canonicalState,
    activeQuery !== "",
  );
  if (mismatchedSection !== null) {
    redirect(peopleHref(canonicalState, mismatchedSection));
  }

  return (
    <section className="py-12 sm:py-16">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">Community</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-5xl">
          People
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
          Find someone by name, discover a useful connection, and handle requests without leaving
          this page.
        </p>
      </div>

      <form
        action="/people"
        className="mt-10 rounded-[1.375rem] border border-border-dark bg-surface-raised p-5"
        method="get"
      >
        <Label htmlFor="people-query">Name or Huddle handle</Label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Input
            defaultValue={attemptedQuery}
            id="people-query"
            maxLength={50}
            minLength={2}
            name="q"
            placeholder="Try a display name or @handle"
            required
          />
          <Button className="min-h-11 rounded-full" type="submit">
            Search people
          </Button>
          {activeQuery === "" ? null : (
            <Button asChild className="min-h-11 rounded-full" variant="outline">
              <Link href="/people">Clear search</Link>
            </Button>
          )}
        </div>
        {attemptedQuery.length > 0 && !parsedSearch.success ? (
          <p className="mt-3 text-sm text-sand">Enter at least two characters.</p>
        ) : (
          <p className="mt-3 text-xs text-muted-dark">
            Two characters search handle prefixes. For display names, every word must contain at
            least three letters or numbers.
          </p>
        )}
      </form>

      {hub.search === null ? null : (
        <PeopleSection
          bucket="search"
          items={hub.search.items}
          page={hub.search}
          state={canonicalState}
          title="Search results"
        />
      )}
      {focusedRelationship === "incoming" && hub.incoming !== null ? (
        <PeopleSection
          bucket="incoming"
          items={hub.incoming.items}
          page={hub.incoming}
          state={canonicalState}
          title="Requests to review"
        />
      ) : null}
      {hub.suggested === null ? null : (
        <PeopleSection
          bucket="suggested"
          items={hub.suggested.items}
          page={hub.suggested}
          state={canonicalState}
          title="Suggested for you"
        />
      )}
      {hub.accepted === null ? null : (
        <PeopleSection
          bucket="accepted"
          items={hub.accepted.items}
          page={hub.accepted}
          state={canonicalState}
          title="Friends"
        />
      )}
      {focusedRelationship !== "incoming" && hub.incoming !== null ? (
        <PeopleSection
          bucket="incoming"
          items={hub.incoming.items}
          page={hub.incoming}
          state={canonicalState}
          title="Requests to review"
        />
      ) : null}
      {hub.sent === null ? null : (
        <PeopleSection
          bucket="sent"
          items={hub.sent.items}
          page={hub.sent}
          state={canonicalState}
          title="Requests you sent"
        />
      )}
    </section>
  );
}

function PeopleSection({
  bucket,
  items,
  page,
  state,
  title,
}: Readonly<{
  bucket: PeopleBucket;
  items: readonly PeopleHubItem[];
  page: PeopleHubPage;
  state: PeoplePageState;
  title: string;
}>) {
  const id = `people-${bucket}`;
  return (
    <section aria-labelledby={id} className="border-t border-border-dark py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold text-linen" id={id}>
          {title}
        </h2>
        <p className="text-sm text-muted-dark">
          {page.totalCount} {page.totalCount === 1 ? "person" : "people"}
        </p>
      </div>
      {page.hasMoreBeyondWindow ? (
        <p className="mt-2 text-sm text-muted-dark">
          Showing the first {page.totalCount.toLocaleString("en-US")} people. Refine your search or
          filters to narrow the list.
        </p>
      ) : null}

      {items.length === 0 ? (
        <Card className="mt-5 border-dashed" size="sm">
          <CardContent>
            <p className="text-sm leading-6 text-muted-dark">{emptyCopy(bucket)}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {items.map((person) => (
            <Card key={person.id} size="sm">
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="inline-flex min-h-11 items-center text-lg font-semibold text-linen hover:text-court"
                      href={`/people/${person.handle}`}
                    >
                      {person.displayName}
                    </Link>
                    <Badge variant="outline">{person.cityName}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-dark">@{person.handle}</p>
                  {person.reason === null ? null : (
                    <p className="mt-3 text-sm text-muted-dark">{person.reason}</p>
                  )}
                </div>
                <FriendshipControl
                  initialFriendship={person.friendship}
                  targetHandle={person.handle}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <PeoplePagination bucket={bucket} page={page} state={state} />
    </section>
  );
}

function emptyCopy(bucket: PeopleBucket): string {
  return {
    suggested: "No safe suggestions right now. Following teams can help Huddle suggest people.",
    search: "No matching people found. Check the handle prefix or use a complete name word.",
    accepted: "No friends yet. Search or start with a suggestion above.",
    incoming: "No requests need your decision.",
    sent: "You have no pending sent requests.",
  }[bucket];
}

function PeoplePagination({
  bucket,
  page,
  state,
}: Readonly<{ bucket: PeopleBucket; page: PeopleHubPage; state: PeoplePageState }>) {
  if (page.pageCount <= 1) return null;
  const href = (nextPage: number) => {
    const nextState: PeoplePageState = {
      ...state,
      searchPage: bucket === "search" ? nextPage : state.searchPage,
      suggestedPage: bucket === "suggested" ? nextPage : state.suggestedPage,
      friendsPage: bucket === "accepted" ? nextPage : state.friendsPage,
      incomingPage: bucket === "incoming" ? nextPage : state.incomingPage,
      sentPage: bucket === "sent" ? nextPage : state.sentPage,
    };
    return peopleHref(nextState, bucket);
  };
  return (
    <Pagination className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href={page.page <= 1 ? undefined : href(page.page - 1)} />
        </PaginationItem>
        <PaginationItem>
          <span className="px-4 text-sm text-muted-dark">
            Page {page.page} of {page.pageCount}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href={page.page >= page.pageCount ? undefined : href(page.page + 1)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function canonicalPeopleSection(
  requested: PeoplePageState,
  canonical: PeoplePageState,
  searchMode: boolean,
): PeopleBucket | null {
  if (searchMode) return requested.searchPage !== canonical.searchPage ? "search" : null;
  if (requested.suggestedPage !== canonical.suggestedPage) return "suggested";
  if (requested.friendsPage !== canonical.friendsPage) return "accepted";
  if (requested.incomingPage !== canonical.incomingPage) return "incoming";
  if (requested.sentPage !== canonical.sentPage) return "sent";
  return null;
}

function peopleHref(state: PeoplePageState, anchor: PeopleBucket): string {
  const params = new URLSearchParams();
  if (state.query.length > 0) {
    params.set("q", state.query);
    params.set("searchPage", String(state.searchPage));
  } else {
    params.set("suggestedPage", String(state.suggestedPage));
    params.set("friendsPage", String(state.friendsPage));
    params.set("incomingPage", String(state.incomingPage));
    params.set("sentPage", String(state.sentPage));
  }
  return `/people?${params.toString()}#people-${anchor}`;
}
