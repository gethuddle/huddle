import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { ReportControl } from "@/features/moderation/components/report-control";
import { ProfileCommunityControl } from "@/features/profiles/components/profile-community-control";
import { toPublicProfileDto } from "@/features/profiles/dto";
import { publicProfileHandleSchema } from "@/features/profiles/schemas";
import { resolvePublicProfileViewerState } from "@/features/profiles/viewer";
import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Community profile — Huddle",
};

type PublicProfilePageProps = Readonly<{
  params: Promise<Readonly<{ handle: string }>>;
}>;

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const routeParams = await params;
  const parsedHandle = publicProfileHandleSchema.safeParse(routeParams.handle);
  if (!parsedHandle.success) notFound();

  const supabase = await createClient();
  const [publicProfileResult, authResult] = await Promise.all([
    supabase.rpc("get_public_profile_by_handle", { lookup_handle: parsedHandle.data }),
    supabase.auth.getUser(),
  ]);

  if (publicProfileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: publicProfileResult.error });
  }

  const publicRow = publicProfileResult.data.at(0);
  if (publicRow === undefined) notFound();

  let profile;
  try {
    profile = toPublicProfileDto(publicRow);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const user = authResult.data.user;
  let viewerState: ReturnType<typeof resolvePublicProfileViewerState> = "anonymous";

  if (user !== null) {
    const ownProfileResult = await supabase
      .from("profiles")
      .select(
        "handle, display_name, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, fan_enabled_at, suspended_at, suspension_expires_at, community_restricted_at, community_restricted_until",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (ownProfileResult.error !== null) {
      throw new DomainError("INTERNAL_ERROR", { cause: ownProfileResult.error });
    }

    const ownProfile = ownProfileResult.data;
    viewerState = resolvePublicProfileViewerState({
      facts: {
        authenticated: true,
        emailVerified: user.email_confirmed_at !== undefined && user.email_confirmed_at !== null,
        profileExists: ownProfile !== null,
        adultAttested:
          ownProfile?.adult_attested_at !== null && ownProfile?.adult_attested_at !== undefined,
        rulesCurrent:
          ownProfile?.rules_version === CURRENT_COMMUNITY_RULES_VERSION &&
          ownProfile.rules_accepted_at !== null,
        profileComplete:
          ownProfile?.profile_completed_at !== null &&
          ownProfile?.profile_completed_at !== undefined &&
          ownProfile.handle !== null &&
          ownProfile.display_name !== null,
        fanEnabled: ownProfile?.fan_enabled_at !== null && ownProfile?.fan_enabled_at !== undefined,
        suspended: ownProfile?.suspended_at !== null && ownProfile?.suspended_at !== undefined,
        restricted:
          ownProfile?.community_restricted_at !== null &&
          ownProfile?.community_restricted_at !== undefined,
      },
      viewerHandle: ownProfile?.handle ?? null,
      targetHandle: profile.handle,
    });
  }

  const memberSince = new Intl.DateTimeFormat("en-IL", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(profile.memberSince));

  return (
    <section className="mx-auto my-12 w-full max-w-4xl sm:my-20">
      <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-none">
        <div className="h-2 bg-court" />
        <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_18rem]">
          <div>
            <p className="text-sm font-medium text-forest">Huddle community</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">
              {profile.displayName}
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">@{profile.handle}</p>

            <dl className="mt-8 border-y border-border py-6">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Member since</dt>
                <dd className="mt-2 font-semibold text-foreground">{memberSince}</dd>
              </div>
            </dl>

            <div className="mt-7">
              <h2 className="text-sm font-semibold text-foreground">About</h2>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-muted-foreground">
                {profile.bio ?? "No bio added yet."}
              </p>
            </div>
          </div>

          <aside aria-label="Community controls" className="self-start">
            <ProfileCommunityControl
              friendship={profile.friendship}
              targetHandle={profile.handle}
              viewerHasBlocked={profile.viewerHasBlocked}
              viewerState={viewerState}
            />
            <p className="mt-4 px-1 text-xs leading-5 text-muted-foreground">
              Public profiles never include email, private memberships, or attendance history.
            </p>
            {viewerState === "self" ? null : (
              <div className="mt-5">
                <ReportControl
                  targetHandle={profile.handle}
                  targetLabel={`@${profile.handle}`}
                  targetType="profile"
                />
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
