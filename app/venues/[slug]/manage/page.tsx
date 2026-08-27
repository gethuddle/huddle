import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EventCard } from "@/features/events/components/event-card";
import { listManagedVenueEvents } from "@/features/events/queries";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getVenueCatalog } from "@/features/venues/catalog";
import { VenueForm } from "@/features/venues/components/venue-form";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";
import { getVenueForManagement } from "@/features/venues/queries";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { getVenueCreationViewerState } from "@/features/venues/viewer";

export const metadata: Metadata = {
  title: "Manage venue — Huddle",
};

type ManageVenuePageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function ManageVenuePage({ params }: ManageVenuePageProps) {
  const parsedSlug = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsedSlug.success) notFound();

  const viewerState = await getVenueCreationViewerState();
  if (viewerState === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Venue management is available only to its signed-in owner."
        eyebrow="Sign in required"
        title="Sign in to manage this venue."
      />
    );
  }
  if (viewerState === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Complete the community account requirements before managing a venue."
        eyebrow="Profile required"
        title="Finish joining first."
      />
    );
  }
  if (viewerState === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot manage venue profiles."
        eyebrow="Not permitted"
        title="Venue management is unavailable."
        warning
      />
    );
  }

  const [venue, catalog] = await Promise.all([
    getVenueForManagement(parsedSlug.data),
    getVenueCatalog(),
  ]);
  if (venue === null) notFound();
  const events = await listManagedVenueEvents(venue.id);

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <VenueVerificationBadge status={venue.verificationStatus} />
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Manage {venue.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-dark">
            Keep the public location and profile accurate. Only a platform moderator can change the
            verification status.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {venue.verificationStatus === "suspended" ? null : (
            <Button asChild>
              <Link href={`/events/new?venue=${venue.slug}`}>Create venue event</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={"/venues/" + venue.slug}>Open public profile</Link>
          </Button>
        </div>
      </div>

      <div className="mt-12 max-w-3xl">
        <VenueForm
          catalog={catalog}
          initialValues={{
            venueId: venue.id,
            name: venue.name,
            slug: venue.slug,
            cityId: venue.cityId,
            addressText: venue.addressText,
            longitude: String(venue.longitude),
            latitude: String(venue.latitude),
            description: venue.description,
            screenCount: venue.screenCount === null ? "" : String(venue.screenCount),
            statedCapacity: venue.statedCapacity === null ? "" : String(venue.statedCapacity),
          }}
          mode="update"
        />
      </div>

      <section aria-labelledby="managed-venue-events-heading" className="mt-14">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
          Venue event management
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-linen" id="managed-venue-events-heading">
          Fixture listings
        </h2>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-muted-dark">
            No drafts or published venue events yet. Start with a synchronized future fixture.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
