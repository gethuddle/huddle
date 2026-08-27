import type { Metadata } from "next";

import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getVenueCatalog } from "@/features/venues/catalog";
import { VenueForm } from "@/features/venues/components/venue-form";
import { getVenueCreationViewerState } from "@/features/venues/viewer";

export const metadata: Metadata = {
  title: "Create an unverified venue — Huddle",
};

export default async function NewVenuePage() {
  const viewerState = await getVenueCreationViewerState();

  if (viewerState === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="A venue profile must have a verified Huddle account as its owner."
        eyebrow="Sign in required"
        title="Sign in to create a venue."
      />
    );
  }
  if (viewerState === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and complete your profile first."
        eyebrow="Profile required"
        title="Finish joining before creating a venue."
      />
    );
  }
  if (viewerState === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot create or manage venue profiles."
        eyebrow="Not permitted"
        title="Venue creation is unavailable."
        warning
      />
    );
  }

  const catalog = await getVenueCatalog();

  return (
    <section className="py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Venue profile
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Put a match-day place on Huddle.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Add a public address, a reviewed Israel coordinate, and truthful capacity details. The
            course MVP does not verify ownership or sell commercial placement.
          </p>
        </div>
        <aside className="self-start rounded-2xl border border-sand/40 bg-sand/10 p-6">
          <p className="font-semibold text-sand">Always visibly unverified</p>
          <p className="mt-3 text-sm leading-6 text-muted-dark">
            Creating this profile does not prove ownership, licensing, safety, accessibility, or
            affiliation with Huddle. Platform verification cannot be changed by a venue owner.
          </p>
        </aside>
      </div>

      <div className="mt-12 max-w-3xl">
        <VenueForm catalog={catalog} mode="create" />
      </div>
    </section>
  );
}
