import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MyHuddleOverview } from "@/features/dashboard/components/my-huddle-overview";
import { getMyHuddleOverview } from "@/features/dashboard/queries";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { DomainError } from "@/lib/errors";
import { z } from "zod";

export const metadata: Metadata = {
  title: "My Huddle — Huddle",
  description: "Find the events, groups and people that belong to your Huddle account.",
};

type DashboardPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const pageSchema = z.coerce.number().int().positive().catch(1);

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const raw = await searchParams;
  const eventPage = pageSchema.parse(
    Array.isArray(raw.eventsPage) ? raw.eventsPage[0] : raw.eventsPage,
  );
  const groupPage = pageSchema.parse(
    Array.isArray(raw.groupsPage) ? raw.groupsPage[0] : raw.groupsPage,
  );
  let overview;
  try {
    overview = await getMyHuddleOverview({ eventPage, groupPage });
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
      return (
        <ProfileAccessState
          actionHref="/settings/profile"
          actionLabel="Finish profile"
          description="Complete your verified profile before using community features."
          eyebrow="Profile required"
          title="Finish joining Huddle first."
          warning={error.code === "ACCOUNT_SUSPENDED"}
        />
      );
    }
    throw error;
  }

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">My Huddle</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Everything you&apos;re part of.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Your hosted and submitted events, attendance, invitations and groups stay together
            here—even when they are private or unlisted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/events/new">Host event</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/people">Find people</Link>
          </Button>
        </div>
      </div>

      <nav aria-label="My Huddle shortcuts" className="my-10 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/friends">Friend requests</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/groups/new">Create group</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/discover">Discover events</Link>
        </Button>
      </nav>

      <MyHuddleOverview
        eventPage={eventPage}
        events={overview.events}
        groupPage={groupPage}
        groups={overview.groups}
      />
    </section>
  );
}
