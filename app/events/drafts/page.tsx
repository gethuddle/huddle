import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { requireActor } from "@/features/auth/actor";
import { listMyEventDrafts } from "@/features/events/drafts";
import { EventDraftList } from "@/features/events/components/event-draft-list";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { DomainError } from "@/lib/errors";
import { collectionPageInput } from "@/lib/pagination";

export const metadata: Metadata = { title: "Saved event drafts — Huddle" };

export default async function DraftsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const raw = (await searchParams).page;
  const requested = collectionPageInput(Array.isArray(raw) ? raw[0] : raw);
  let drafts;
  try {
    const { supabase } = await requireActor("authenticated");
    drafts = await listMyEventDrafts(supabase, requested.page);
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED")
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in?next=%2Fevents%2Fdrafts"
          actionLabel="Sign in"
          description="Your unfinished event drafts are private to your account."
          eyebrow="Sign in required"
          title="Sign in to recover your drafts."
        />
      );
    throw error;
  }
  if (requested.wasAboveWindow || drafts.page !== requested.page)
    redirect(`/events/drafts?page=${drafts.page}`);
  return (
    <section className="space-y-8 py-12 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em]">Saved drafts</h1>
          <p className="mt-3 text-muted-foreground">
            Resume an unfinished private event or discard a draft you no longer need. Only you can
            see these drafts.
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">Start an event</Link>
        </Button>
      </div>
      <EventDraftList drafts={drafts.items} />
      {drafts.hasMoreBeyondWindow ? (
        <p className="text-sm text-muted-foreground">
          Showing the most recent {drafts.totalCount.toLocaleString("en-US")} drafts. Discard older
          unfinished drafts to make room in this list.
        </p>
      ) : null}
      {drafts.pageCount > 1 ? (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={drafts.page === 1}
                href={drafts.page === 1 ? undefined : `/events/drafts?page=${drafts.page - 1}`}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                Page {drafts.page} of {drafts.pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                aria-disabled={drafts.page >= drafts.pageCount}
                href={
                  drafts.page >= drafts.pageCount
                    ? undefined
                    : `/events/drafts?page=${drafts.page + 1}`
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}
