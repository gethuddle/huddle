import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventCard } from "@/features/events/components/event-card";
import { listVenueEvents } from "@/features/events/queries";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { ReportControl } from "@/features/moderation/components/report-control";
import { VenueFollowControl } from "@/features/venues/components/venue-follow-control";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";
import { getVenueBySlug } from "@/features/venues/queries";
import { venueRouteSlugSchema } from "@/features/venues/schemas";
import { getVenueCreationViewerState } from "@/features/venues/viewer";

export const metadata: Metadata = {
  title: "Venue — Huddle",
};

type VenuePageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export default async function VenuePage({ params }: VenuePageProps) {
  const parsedSlug = venueRouteSlugSchema.safeParse((await params).slug);
  if (!parsedSlug.success) notFound();

  const [venue, viewerState, events] = await Promise.all([
    getVenueBySlug(parsedSlug.data),
    getVenueCreationViewerState(),
    listVenueEvents(parsedSlug.data),
  ]);
  if (venue === null) notFound();

  return (
    <section className="py-12 sm:py-16">
      <div className="overflow-hidden rounded-[2rem] border border-border-dark bg-surface-raised shadow-2xl shadow-black/20">
        <div className="h-2 bg-sand" />
        <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_20rem]">
          <div>
            <VenueVerificationBadge status={venue.verificationStatus} />
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
              {venue.name}
            </h1>
            <p className="mt-5 max-w-2xl whitespace-pre-wrap text-lg leading-8 text-muted-dark">
              {venue.description}
            </p>
            <dl className="mt-8 grid gap-5 border-y border-border-dark py-6 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">
                  City
                </dt>
                <dd className="mt-2 font-semibold text-linen">{venue.cityName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">
                  Screens
                </dt>
                <dd className="mt-2 font-semibold text-linen">
                  {venue.screenCount ?? "Not stated"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark">
                  Stated capacity
                </dt>
                <dd className="mt-2 font-semibold text-linen">
                  {venue.statedCapacity ?? "Not stated"}
                </dd>
              </div>
            </dl>
            <p className="mt-6 font-semibold text-linen">{venue.addressText}</p>
            <p className="mt-2 text-sm text-muted-dark">
              <span>Profile owner: </span>
              <Link className="text-linen hover:text-court" href={"/people/" + venue.ownerHandle}>
                @{venue.ownerHandle}
              </Link>
            </p>
          </div>

          <aside aria-label="Venue controls" className="self-start">
            <Card className="bg-surface-deep" size="sm">
              <CardHeader>
                <CardTitle className="text-linen">Venue status</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-dark">
                  {venue.followerCount} {venue.followerCount === 1 ? "follower" : "followers"}.
                  Unverified means Huddle has not checked this business identity.
                </p>
                {venue.viewerIsOwner ? (
                  <Button asChild className="mt-5 w-full">
                    <Link href={"/venues/" + venue.slug + "/manage"}>Manage venue</Link>
                  </Button>
                ) : viewerState === "eligible" ? (
                  <div className="mt-5">
                    <VenueFollowControl
                      initiallyFollowing={venue.viewerFollows}
                      venueId={venue.id}
                      venueName={venue.name}
                      venueSlug={venue.slug}
                    />
                  </div>
                ) : null}
                <div className="mt-5">
                  <ReportControl targetId={venue.id} targetLabel={venue.name} targetType="venue" />
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {viewerState === "anonymous" ? (
        <div className="mt-8">
          <ProfileAccessState
            actionHref="/auth/sign-in"
            actionLabel="Sign in"
            description="Public venue details remain available. Sign in and complete your profile to follow it."
            eyebrow="Follow venues"
            title="Sign in to keep this venue close."
          />
        </div>
      ) : null}

      <section aria-labelledby="venue-events-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
              Fixture listings
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-linen" id="venue-events-heading">
              Future venue events
            </h2>
          </div>
          {venue.viewerIsOwner ? (
            <Button asChild>
              <Link href={`/events/new?venue=${venue.slug}`}>Create venue event</Link>
            </Button>
          ) : null}
        </div>
        {events.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              description="This venue has no published future fixture listing. Drafts and suspended listings are never shown here."
              headingLevel="h3"
              title="No venue events published yet."
            />
          </div>
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
