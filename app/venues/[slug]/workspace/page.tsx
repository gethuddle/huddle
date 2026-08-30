import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { TodayDashboard } from "@/features/venues/workspace/components/today-dashboard";
import { getVenueToday } from "@/features/venues/workspace/queries";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueTodayPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenueTodayPage({ params }: VenueTodayPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();
  const snapshot = await getVenueToday(workspace.id);
  const today = new Intl.DateTimeFormat("en-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <section className="py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand">
            Venue workspace
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Today</h1>
          <p className="mt-3 text-lg text-muted-dark">
            {today} · {snapshot.todayEvents.length} event
            {snapshot.todayEvents.length === 1 ? "" : "s"} scheduled
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <VenueVerificationBadge status={workspace.verificationStatus} />
          <Button asChild variant="outline">
            <Link href={`/venues/${workspace.slug}`}>View public page</Link>
          </Button>
        </div>
      </div>

      <TodayDashboard slug={workspace.slug} snapshot={snapshot} />
    </section>
  );
}
