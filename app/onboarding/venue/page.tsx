import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import type { CityOption } from "@/features/profiles/components/profile-form";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { CommonOnboardingForm } from "@/features/workspaces/components/common-onboarding-form";
import { VenueOnboardingForm } from "@/features/workspaces/components/venue-onboarding-form";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Set up Venue — Huddle" };

export default async function VenueOnboardingPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (user === null) {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Sign in before setting up a Venue workspace."
        eyebrow="Sign in required"
        title="Continue with your account."
      />
    );
  }
  if (user.email_confirmed_at === undefined || user.email_confirmed_at === null) {
    return (
      <ProfileAccessState
        description="Open the verification link sent to your email, then return to Venue setup."
        eyebrow="Verification required"
        title="Verify your email first."
        warning
      />
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "adult_attested_at, rules_version, rules_accepted_at, suspended_at, community_restricted_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (error !== null || profile === null) {
    return (
      <ProfileAccessState
        description="Venue setup could not load. Your account is safe and no changes were made."
        eyebrow="Temporarily unavailable"
        title="We couldn’t prepare Venue setup."
        warning
      />
    );
  }
  if (profile.suspended_at !== null || profile.community_restricted_at !== null) {
    return (
      <ProfileAccessState
        description="This account cannot create or manage a venue right now."
        eyebrow="Not permitted"
        title="Venue setup is unavailable."
        warning
      />
    );
  }

  const commonEligible =
    profile.adult_attested_at !== null &&
    profile.rules_version === CURRENT_COMMUNITY_RULES_VERSION &&
    profile.rules_accepted_at !== null;

  let content;
  if (!commonEligible) {
    content = <CommonOnboardingForm />;
  } else {
    const publicCatalog = createAnonymousServerClient();
    const cityResult = await publicCatalog
      .from("cities")
      .select("id, slug, name_en")
      .eq("active", true)
      .order("name_en");
    if (cityResult.error !== null || cityResult.data.length === 0) {
      return (
        <ProfileAccessState
          description="No active Israel cities are configured. No venue was created."
          eyebrow="Setup temporarily unavailable"
          title="We couldn’t load the city list."
          warning
        />
      );
    }
    const cities: CityOption[] = cityResult.data.map((city) => ({
      id: city.id,
      slug: city.slug,
      name: city.name_en,
    }));
    content = <VenueOnboardingForm cities={cities} ownerId={user.id} />;
  }

  return (
    <section className="mx-auto my-12 w-full max-w-4xl sm:my-16">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-forest">Venue setup</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Give your business its own workspace.
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Huddle keeps venue operations separate from your optional Fan identity. New venues are
          immediately usable and clearly labelled as self-listed until Huddle checks the business.
        </p>
      </div>
      <div className="rounded-[1.375rem] border border-border bg-card p-6 sm:p-9">{content}</div>
    </section>
  );
}
