import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrivateEventForm } from "@/features/events/components/private-event-form";
import { VenueEventForm } from "@/features/events/components/venue-event-form";
import { getPrivateEventCatalog, getVenueEventCatalog } from "@/features/events/catalog";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getVenueForManagement } from "@/features/venues/queries";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { getVenueCreationViewerState } from "@/features/venues/viewer";

export const metadata: Metadata = {
  title: "Host an event — Huddle",
};

type NewEventPageProps = Readonly<{
  searchParams: Promise<Readonly<{ matchId?: string; venue?: string }>>;
}>;

export default async function NewEventPage({ searchParams }: NewEventPageProps) {
  const requested = await searchParams;
  const viewerState = await getVenueCreationViewerState();
  if (viewerState === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Every event host and attendee is one verified Huddle account."
        eyebrow="Sign in required"
        title="Sign in to host an event."
      />
    );
  }
  if (viewerState === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and complete your profile before hosting."
        eyebrow="Profile required"
        title="Finish joining before hosting."
      />
    );
  }
  if (viewerState === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot create or manage events."
        eyebrow="Not permitted"
        title="Event hosting is unavailable."
        warning
      />
    );
  }

  if (requested.venue !== undefined) {
    const parsedVenueSlug = venueRouteSlugSchema.safeParse(requested.venue);
    if (!parsedVenueSlug.success) notFound();
    const [venue, catalog] = await Promise.all([
      getVenueForManagement(parsedVenueSlug.data),
      getVenueEventCatalog(),
    ]);
    if (venue === null) notFound();
    if (venue.verificationStatus === "suspended" || venue.suspendedAt !== null) {
      return (
        <ProfileAccessState
          description="Suspended venue profiles cannot create or publish events."
          eyebrow="Venue unavailable"
          title="This venue cannot host an event."
          warning
        />
      );
    }

    const parsedMatchId = eventRouteIdSchema.safeParse(requested.matchId);
    const initialMatchId =
      parsedMatchId.success && catalog.matches.some((match) => match.id === parsedMatchId.data)
        ? parsedMatchId.data
        : "";

    return (
      <section className="py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
              Business-venue event
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
              Put the fixture on the big screen.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
              Publish a safe public or team-follower listing from an owned venue. The venue profile
              remains visibly {venue.verificationStatus}.
            </p>
          </div>
          <aside className="self-start rounded-2xl border border-sand/40 bg-sand/10 p-6">
            <p className="font-semibold text-sand">Commercial listing</p>
            <p className="mt-3 text-sm leading-6 text-muted-dark">
              Costs and commercial affiliation stay explicit. Huddle does not verify the business
              identity or add paid promotion in the MVP.
            </p>
          </aside>
        </div>

        <div className="mt-12 max-w-4xl">
          {catalog.matches.length === 0 ? (
            <ProfileAccessState
              description="Run the protected sports synchronization and try again. Normal page requests never call the provider."
              eyebrow="Fixture catalog empty"
              title="No synchronized future match is available."
              warning
            />
          ) : (
            <VenueEventForm
              catalog={catalog}
              initialMatchId={initialMatchId}
              venue={{
                id: venue.id,
                slug: venue.slug,
                name: venue.name,
                addressText: venue.addressText,
                statedCapacity: venue.statedCapacity,
                verificationStatus: venue.verificationStatus,
              }}
            />
          )}
        </div>
      </section>
    );
  }

  const catalog = await getPrivateEventCatalog();
  const parsedMatchId = eventRouteIdSchema.safeParse(requested.matchId);
  const initialMatchId =
    parsedMatchId.success && catalog.matches.some((match) => match.id === parsedMatchId.data)
      ? parsedMatchId.data
      : "";

  return (
    <section className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Private-person event
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Host match day safely.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Start from a synchronized fixture, choose a restricted audience, and keep any home
            location outside the ordinary event response.
          </p>
        </div>
        <aside className="self-start rounded-2xl border border-sand/40 bg-sand/10 p-6">
          <p className="font-semibold text-sand">One account, one attendee</p>
          <p className="mt-3 text-sm leading-6 text-muted-dark">
            Personal events always require host approval. Home events allow at most 12 registered
            accounts and never accept anonymous guests or plus-ones.
          </p>
        </aside>
      </div>

      <div className="mt-12 max-w-4xl">
        {catalog.matches.length === 0 ? (
          <ProfileAccessState
            description="Run the protected sports synchronization and try again. Normal page requests never call the provider."
            eyebrow="Fixture catalog empty"
            title="No synchronized future match is available."
            warning
          />
        ) : (
          <PrivateEventForm catalog={catalog} initialMatchId={initialMatchId} />
        )}
      </div>
    </section>
  );
}
