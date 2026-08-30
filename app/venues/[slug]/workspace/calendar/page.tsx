import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { VenueCalendar } from "@/features/venues/workspace/components/venue-calendar";
import { listVenueCalendar } from "@/features/venues/workspace/queries";
import { getAuthorizedVenueWorkspaceBySlug } from "@/features/workspaces/queries";

type VenueCalendarPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenueCalendarPage({ params }: VenueCalendarPageProps) {
  const parsed = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const workspace = await getAuthorizedVenueWorkspaceBySlug(parsed.data);
  if (workspace === null) notFound();
  const calendar = await listVenueCalendar(workspace.id, 100);

  return (
    <section className="py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand">Venue workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Calendar</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-dark">
        {calendar.length} event{calendar.length === 1 ? "" : "s"} across drafts, published plans,
        and history.
      </p>

      {calendar.length === 0 ? (
        <EmptyState
          description="Venue events stay available here after their status changes."
          title="Your calendar is clear"
        />
      ) : (
        <VenueCalendar events={calendar} />
      )}
    </section>
  );
}
