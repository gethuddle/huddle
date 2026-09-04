import { notFound } from "next/navigation";

import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { TodayDashboard } from "@/features/venues/workspace/components/today-dashboard";
import { getVenueToday } from "@/features/venues/workspace/queries";
import {
  getAuthorizedVenueWorkspaceBySlug,
  getAuthorizedVenueWorkspaceSummaryBySlug,
} from "@/features/workspaces/queries";

type VenueTodayPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenueTodayPage({ params }: VenueTodayPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspacePromise = getAuthorizedVenueWorkspaceBySlug(parsed.data);
  const authorizedWorkspace = await getAuthorizedVenueWorkspaceSummaryBySlug(parsed.data);
  if (authorizedWorkspace === null) notFound();

  const snapshotPromise = getVenueToday(authorizedWorkspace.id);
  // The detailed projection still gates every rendered Venue capability. The
  // protected Today RPC can run concurrently because it independently checks
  // the same active Venue membership in PostgreSQL.
  void snapshotPromise.catch(() => undefined);
  const workspace = await workspacePromise;
  if (workspace === null) notFound();
  const snapshot = await snapshotPromise;
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
          <p className="text-sm font-medium text-sand">Venue workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">Today</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {today} · {snapshot.todayEvents.length} event
            {snapshot.todayEvents.length === 1 ? "" : "s"} scheduled
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <VenueVerificationBadge status={workspace.verificationStatus} />
        </div>
      </div>

      <TodayDashboard
        slug={workspace.slug}
        snapshot={snapshot}
        canPrepareDrafts={workspace.billing.canPrepareDrafts}
      />
    </section>
  );
}
