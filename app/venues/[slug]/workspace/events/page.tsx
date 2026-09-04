import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { VenueCalendar } from "@/features/venues/workspace/components/venue-calendar";
import { listVenueCalendar } from "@/features/venues/workspace/queries";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueEventsPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenueEventsPage({ params }: VenueEventsPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();
  const events = await listVenueCalendar(workspace.id, 250);

  return (
    <section className="py-10 sm:py-14">
      <p className="text-sm font-medium text-sand">Venue workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">Events</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Find every draft, published listing, and past match night in one place.
      </p>

      {events.length === 0 ? (
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
        <VenueCalendar events={events} surface="events" />
      )}
    </section>
  );
}
