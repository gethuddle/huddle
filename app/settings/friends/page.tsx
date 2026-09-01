import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { FriendshipControl } from "@/features/friendships/components/friendship-control";
import { getFriendshipSettings } from "@/features/friendships/list";
import { friendshipListQuerySchema, type FriendshipBucket } from "@/features/friendships/schemas";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";

export const metadata: Metadata = {
  title: "Your friends — Huddle",
};

type FriendsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const BUCKET_COPY = {
  incoming: {
    label: "Incoming",
    emptyTitle: "No incoming requests.",
    emptyDescription: "New direct friend requests will appear here for you to accept or decline.",
  },
  outgoing: {
    label: "Sent",
    emptyTitle: "No sent requests.",
    emptyDescription: "Use a safe public profile to send someone a direct friend request.",
  },
  accepted: {
    label: "Friends",
    emptyTitle: "No accepted friends yet.",
    emptyDescription: "Only accepted direct friendships can qualify for friends-only events.",
  },
} satisfies Record<FriendshipBucket, Readonly<Record<string, string>>>;

export default async function FriendsSettingsPage({ searchParams }: FriendsPageProps) {
  const raw = await searchParams;
  const query = friendshipListQuerySchema.parse({
    bucket: Array.isArray(raw.bucket) ? raw.bucket[0] : raw.bucket,
    page: Array.isArray(raw.page) ? raw.page[0] : raw.page,
  });
  const result = await getFriendshipSettings(query.bucket, query.page);

  if (result.state === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Friend requests belong to your signed-in Fan account."
        eyebrow="Sign in required"
        title="Sign in to manage friendships."
      />
    );
  }
  if (result.state === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and finish your profile first."
        eyebrow="Profile required"
        title="Finish joining before adding friends."
      />
    );
  }
  if (result.state === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot change community relationships."
        eyebrow="Not permitted"
        title="Friendship settings are unavailable."
        warning
      />
    );
  }

  const copy = BUCKET_COPY[query.bucket];

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-forest">Your people</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            Direct friendships.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            Requests are mutual and private. Only accepted direct friends count—Huddle never expands
            access through friends of friends.
          </p>
        </div>
        <Button asChild>
          <Link href="/people">Find people</Link>
        </Button>
      </div>

      <nav aria-label="Friendship lists" className="mt-10 flex flex-wrap gap-2">
        {(Object.keys(BUCKET_COPY) as FriendshipBucket[]).map((bucket) => (
          <Button asChild key={bucket} variant={bucket === query.bucket ? "default" : "outline"}>
            <Link
              aria-current={bucket === query.bucket ? "page" : undefined}
              href={`?bucket=${bucket}`}
            >
              {BUCKET_COPY[bucket].label}
            </Link>
          </Button>
        ))}
      </nav>

      {result.items.length === 0 ? (
        <EmptyState
          action={
            query.bucket === "outgoing" ? (
              <Button asChild variant="outline">
                <Link href="/people">Find people</Link>
              </Button>
            ) : undefined
          }
          description={copy.emptyDescription}
          headingLevel="h2"
          title={copy.emptyTitle}
        />
      ) : (
        <div className="mt-8 space-y-4">
          {result.items.map((friendship) => (
            <Card key={friendship.id} size="sm">
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="font-semibold text-foreground underline-offset-4 hover:text-forest hover:underline"
                      href={`/people/${friendship.handle}`}
                    >
                      {friendship.displayName}
                    </Link>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">@{friendship.handle}</p>
                </div>
                <FriendshipControl
                  initialFriendship={{
                    id: friendship.id,
                    status: friendship.status,
                    direction: friendship.direction,
                  }}
                  targetHandle={friendship.handle}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result.pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={query.page <= 1}
                className={query.page <= 1 ? "pointer-events-none opacity-50" : undefined}
                href={`?bucket=${query.bucket}&page=${Math.max(1, query.page - 1)}`}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                Page {query.page} of {result.pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={query.page >= result.pageCount}
                className={
                  query.page >= result.pageCount ? "pointer-events-none opacity-50" : undefined
                }
                href={`?bucket=${query.bucket}&page=${Math.min(result.pageCount, query.page + 1)}`}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}
