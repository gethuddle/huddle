import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
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

  const [venue, viewerState] = await Promise.all([
    getVenueBySlug(parsedSlug.data),
    getVenueCreationViewerState(),
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

      <div className="mt-10">
        <EmptyState
          description="Venue-hosted fixture listings are implemented in B08. This B07 profile is public and followable, but it does not advertise fake events."
          headingLevel="h2"
          title="No venue events published yet."
        />
      </div>
    </section>
  );
}
