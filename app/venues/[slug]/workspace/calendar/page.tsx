import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { VenueCalendar } from "@/features/venues/workspace/components/venue-calendar";
import { listVenueCalendarPage } from "@/features/venues/workspace/queries";
import { venueCollectionHref, venueCollectionState } from "@/features/venues/workspace/event-links";
import { collectionPageCount } from "@/lib/pagination";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueCalendarPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function VenueCalendarPage({ params, searchParams }: VenueCalendarPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();
  const state = venueCollectionState(await searchParams);
  if (state.wasAboveWindow)
    redirect(venueCollectionHref(workspace.slug, "calendar", state.status, state.page));
  let history = await listVenueCalendarPage(workspace.id, state.status, state.page);
  if (state.page > 1 && history.items.length === 0) {
    const first = await listVenueCalendarPage(workspace.id, state.status, 1);
    const finalPage = collectionPageCount(first.totalCount);
    if (state.page > finalPage)
      redirect(venueCollectionHref(workspace.slug, "calendar", state.status, finalPage));
    history = { ...history, totalCount: first.totalCount };
  }
  const statusLabel = `${state.status.charAt(0).toUpperCase()}${state.status.slice(1)}`;

  return (
    <section className="py-10 sm:py-14">
      <p className="text-sm font-medium text-sand">Venue workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">Calendar</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        {history.totalCount} event{history.totalCount === 1 ? "" : "s"}
        {state.status === "all"
          ? " across drafts, published plans, and history."
          : ` in the ${statusLabel} view.`}
      </p>
      {!workspace.billing.canOperateExistingEvents ? (
        <p className="mt-3 text-sm text-muted-foreground">
          History remains available. Editing is locked.
        </p>
      ) : null}

      {history.items.length === 0 && state.status === "all" ? (
        <EmptyState
          description="Venue events stay available here after their status changes."
          title="Your calendar is clear"
        />
      ) : (
        <VenueCalendar
          events={history.items}
          slug={workspace.slug}
          status={state.status}
          page={state.page}
          totalCount={history.totalCount}
        />
      )}
    </section>
  );
}
