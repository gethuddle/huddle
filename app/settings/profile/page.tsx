import type { Metadata } from "next";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import {
  ProfileForm,
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
        description="Sign in before completing your Fan profile."
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

  const profileResult = await supabase
    .from("profiles")
    .select(
      "handle, display_name, bio, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, suspended_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error !== null || profileResult.data === null) {
    return (
      <ProfileAccessState
        description="Your profile could not be loaded right now. Try again in a moment."
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

  const initialValue: ProfileFormInitialValue = {
    handle: profile.handle ?? "",
    displayName: profile.display_name ?? "",
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
        <p className="text-sm font-medium text-forest">Profile and trust</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">
          {initialValue.completed ? "Keep your profile current." : "Complete your Fan profile"}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          {initialValue.completed
            ? "Update how people know you. Your saved eligibility stays compact unless the community rules change."
            : "Choose how people know you and complete the eligibility steps that keep real gatherings safer."}
        </p>
      </div>

      <div className="rounded-[1.375rem] border border-border bg-card p-6 sm:p-10">
        <ProfileForm initialValue={initialValue} />
      </div>
    </section>
  );
}
