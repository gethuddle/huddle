import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { fanRecovery } from "@/features/auth/fan-recovery";
import { MyHuddleOverview } from "@/features/dashboard/components/my-huddle-overview";
import {
  eventBuckets,
  getMyHuddleOverview,
  groupBuckets,
  savedBuckets,
} from "@/features/dashboard/queries";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { DomainError } from "@/lib/errors";
import { collectionPageInput } from "@/lib/pagination";
import { z } from "zod";

export const metadata: Metadata = {
  title: "My Huddle — Huddle",
  description: "Find the events, groups and people that belong to your Huddle account.",
};

type DashboardPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const eventBucketSchema = z.enum(eventBuckets).catch("upcoming");
const groupBucketSchema = z.enum(groupBuckets).catch("owner");
const savedBucketSchema = z.enum(savedBuckets).catch("all");

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const raw = await searchParams;
  const eventBucket = eventBucketSchema.parse(first(raw.eventBucket));
  const eventPageInput = collectionPageInput(first(raw.eventsPage));
  const eventPage = eventPageInput.page;
  const groupBucket = groupBucketSchema.parse(first(raw.groupBucket));
  const groupPageInput = collectionPageInput(first(raw.groupsPage));
  const groupPage = groupPageInput.page;
  const savedBucket = savedBucketSchema.parse(first(raw.savedBucket));
  const savedPageInput = collectionPageInput(first(raw.savedPage));
  const savedPage = savedPageInput.page;

  if (
    eventPageInput.wasAboveWindow ||
    groupPageInput.wasAboveWindow ||
    savedPageInput.wasAboveWindow
  ) {
    const params = new URLSearchParams({
      eventBucket,
      eventsPage: String(eventPage),
      groupBucket,
      groupsPage: String(groupPage),
      savedBucket,
      savedPage: String(savedPage),
    });
    const anchor = eventPageInput.wasAboveWindow
      ? "your-events-heading"
      : groupPageInput.wasAboveWindow
        ? "your-groups-heading"
        : "your-saved-heading";
    redirect(`/dashboard?${params.toString()}#${anchor}`);
  }
  let overview;
  try {
    overview = await getMyHuddleOverview({
      eventBucket,
      eventPage,
      groupBucket,
      groupPage,
      savedBucket,
      savedPage,
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "AUTH_REQUIRED") {
      return (
        <ProfileAccessState
          actionHref="/auth/sign-in"
          actionLabel="Sign in"
          description="Your groups, hosted events, invitations and attendance all live in My Huddle."
          eyebrow="Sign in required"
          title="Sign in to open My Huddle."
        />
      );
    }
    if (error instanceof DomainError && error.code !== "INTERNAL_ERROR") {
      return <ProfileAccessState {...fanRecovery(error.code)} />;
    }
    throw error;
  }

  const canonicalPages = overview.pages;
  if (
    canonicalPages.events !== eventPage ||
    canonicalPages.groups !== groupPage ||
    canonicalPages.saved !== savedPage
  ) {
    const params = new URLSearchParams({
      eventBucket,
      eventsPage: String(canonicalPages.events),
      groupBucket,
      groupsPage: String(canonicalPages.groups),
      savedBucket,
      savedPage: String(canonicalPages.saved),
    });
    const anchor =
      canonicalPages.events !== eventPage
        ? "your-events-heading"
        : canonicalPages.groups !== groupPage
          ? "your-groups-heading"
          : "your-saved-heading";
    redirect(`/dashboard?${params.toString()}#${anchor}`);
  }

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">My Huddle</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Your events, groups and saved places.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Pick up active plans without digging through admin screens. Invitations and requests
            appear on Home only while they need your attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link href="/events/new">Host event</Link>
          </Button>
          <Button asChild className="min-h-11" variant="outline">
            <Link href="/people">Find people</Link>
          </Button>
        </div>
      </div>

      <div className="mt-10">
        <MyHuddleOverview
          eventBucket={eventBucket}
          eventPage={canonicalPages.events}
          events={overview.events}
          groupBucket={groupBucket}
          groupPage={canonicalPages.groups}
          groups={overview.groups}
          saved={overview.saved}
          savedBucket={savedBucket}
          savedPage={canonicalPages.saved}
        />
      </div>
    </section>
  );
}
