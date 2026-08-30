import { redirect } from "next/navigation";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import {
  ProfileForm,
  type CityOption,
  type ProfileFormInitialValue,
} from "@/features/profiles/components/profile-form";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Set up Fan — Huddle" };

export default async function FanOnboardingPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (user === null) {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Sign in before creating your Fan workspace."
        eyebrow="Sign in required"
        title="Continue with your account."
      />
    );
  }
  if (user.email_confirmed_at === undefined || user.email_confirmed_at === null) {
    return (
      <ProfileAccessState
        description="Open the verification link sent to your email, then return to Fan setup."
        eyebrow="Verification required"
        title="Verify your email first."
        warning
      />
    );
  }

  const publicCatalog = createAnonymousServerClient();
  const [profileResult, cityResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "handle, display_name, city_id, bio, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, fan_enabled_at, suspended_at, community_restricted_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    publicCatalog.from("cities").select("id, slug, name_en").eq("active", true).order("name_en"),
  ]);
  const profile = profileResult.data;
  if (profileResult.error !== null || cityResult.error !== null || profile === null) {
    return (
      <ProfileAccessState
        description="Fan setup could not load. Your account is safe and no changes were made."
        eyebrow="Temporarily unavailable"
        title="We couldn’t prepare Fan setup."
        warning
      />
    );
  }
  if (profile.suspended_at !== null || profile.community_restricted_at !== null) {
    return (
      <ProfileAccessState
        description="This account cannot activate Fan features right now. Safety and appeal actions remain available from Account."
        eyebrow="Not permitted"
        title="Fan setup is unavailable."
        warning
      />
    );
  }
  if (profile.fan_enabled_at !== null) {
    const commonEligible =
      profile.adult_attested_at !== null &&
      profile.rules_version === CURRENT_COMMUNITY_RULES_VERSION &&
      profile.rules_accepted_at !== null;
    redirect(commonEligible ? "/" : "/onboarding");
  }
  if (cityResult.data.length === 0) {
    return (
      <ProfileAccessState
        description="No active Israel cities are configured. No Fan profile was published."
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
  const initialValue: ProfileFormInitialValue = {
    handle: profile.handle ?? "",
    displayName: profile.display_name ?? "",
    citySlug: cities.find((city) => city.id === profile.city_id)?.slug ?? "",
    bio: profile.bio ?? "",
    adultAttested: profile.adult_attested_at !== null,
    currentRulesAccepted:
      profile.rules_version === CURRENT_COMMUNITY_RULES_VERSION &&
      profile.rules_accepted_at !== null,
    completed: profile.profile_completed_at !== null,
  };

  return (
    <section className="mx-auto my-12 w-full max-w-4xl sm:my-16">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">Fan setup</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Tell fans how to know you.
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-dark">
          One short form activates the social and attendance side of Huddle.
        </p>
      </div>
      <div className="rounded-[1.375rem] border border-border-dark bg-surface-raised p-6 sm:p-9">
        <ProfileForm
          cities={cities}
          draftOwnerId={user.id}
          initialValue={initialValue}
          mode="onboarding"
        />
      </div>
    </section>
  );
}
