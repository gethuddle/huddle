import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { VenueCalendar } from "@/features/venues/workspace/components/venue-calendar";
import { listVenueCalendarPage } from "@/features/venues/workspace/queries";
import { venueCollectionHref, venueCollectionState } from "@/features/venues/workspace/event-links";
import { collectionPageCount } from "@/lib/pagination";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueEventsPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function VenueEventsPage({ params, searchParams }: VenueEventsPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();
  const state = venueCollectionState(await searchParams);
  if (state.wasAboveWindow)
    redirect(venueCollectionHref(workspace.slug, "events", state.status, state.page));
  let history = await listVenueCalendarPage(workspace.id, state.status, state.page);
  if (state.page > 1 && history.items.length === 0) {
    const first = await listVenueCalendarPage(workspace.id, state.status, 1);
    const finalPage = collectionPageCount(first.totalCount);
    if (state.page > finalPage)
      redirect(venueCollectionHref(workspace.slug, "events", state.status, finalPage));
    history = { ...history, totalCount: first.totalCount };
  }

  return (
    <section className="py-10 sm:py-14">
      <p className="text-sm font-medium text-sand">Venue workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">Events</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Find drafts, published listings, and past match nights in one place.
      </p>

      {history.items.length === 0 && state.status === "all" ? (
        <EmptyState
          action={
            workspace.billing.canPrepareDrafts ? (
              <Button asChild>
                <Link href={`/venues/${workspace.slug}/workspace/plan`}>Plan events</Link>
              </Button>
            ) : undefined
          }
          description="Pick one or more fixtures and Huddle will prefill each event from your Venue defaults."
          title="No venue events yet"
        />
      ) : (
        <VenueCalendar
          events={history.items}
          surface="events"
          slug={workspace.slug}
          status={state.status}
          page={state.page}
          totalCount={history.totalCount}
        />
      )}
    </section>
  );
}
