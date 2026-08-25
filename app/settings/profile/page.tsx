import type { Metadata } from "next";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import {
  ProfileForm,
  type CityOption,
  type ProfileFormInitialValue,
} from "@/features/profiles/components/profile-form";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your profile — Huddle",
};

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (user === null) {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Sign in with your verified Huddle account before completing a profile."
        eyebrow="Sign in required"
        title="Your profile starts with your account."
      />
    );
  }

  if (user.email_confirmed_at === undefined || user.email_confirmed_at === null) {
    return (
      <ProfileAccessState
        description="Open the verification link sent to your email address, then return here."
        eyebrow="Verification required"
        title="Verify your email first."
        warning
      />
    );
  }

  const [profileResult, cityResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "handle, display_name, city_id, bio, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, suspended_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("cities").select("id, slug, name_en").eq("active", true).order("name_en"),
  ]);

  if (profileResult.error !== null || cityResult.error !== null || profileResult.data === null) {
    return (
      <ProfileAccessState
        description="The local profile service could not prepare this form. Try again after the database is available."
        eyebrow="Unable to continue"
        title="We couldn’t load your profile."
        warning
      />
    );
  }

  const profile = profileResult.data;
  if (profile.suspended_at !== null) {
    return (
      <ProfileAccessState
        description="This account cannot change profile or community state."
        eyebrow="Not permitted"
        title="Profile changes are unavailable."
        warning
      />
    );
  }

  const cities: CityOption[] = cityResult.data.map((city) => ({
    id: city.id,
    slug: city.slug,
    name: city.name_en,
  }));
  const citySlug = cities.find((city) => city.id === profile.city_id)?.slug ?? "";
  const initialValue: ProfileFormInitialValue = {
    handle: profile.handle ?? "",
    displayName: profile.display_name ?? "",
    citySlug,
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
          Profile and trust
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-linen sm:text-5xl">
          {initialValue.completed ? "Keep your profile current." : "Finish joining Huddle."}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-dark">
          Choose how people know you, set your city fallback, confirm you are 18+, and accept the
          rules that keep real gatherings safer.
        </p>
      </div>

      <div className="rounded-[2rem] border border-border-dark bg-surface-raised p-6 shadow-2xl shadow-black/20 sm:p-10">
        <ProfileForm cities={cities} initialValue={initialValue} />
      </div>
    </section>
  );
}
