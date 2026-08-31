import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupInviteApplicationForm } from "@/features/groups/components/group-invite-application-form";
import { getGroupInvitePreview } from "@/features/groups/invites";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";

export const metadata: Metadata = {
  title: "Group invitation — Huddle",
};

type GroupInvitePageProps = Readonly<{
  params: Promise<Readonly<{ token: string }>>;
}>;

export default async function GroupInvitePage({ params }: GroupInvitePageProps) {
  const { token } = await params;
  const preview = await getGroupInvitePreview(token);

  if (preview.state === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Group invitations are bound to one signed-in Fan account and never admit anonymous guests. Sign in, then reopen this invitation."
        eyebrow="Sign in required"
        title="Sign in to use this invitation."
      />
    );
  }
  if (preview.state === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and complete your profile before reopening this invitation."
        eyebrow="Profile required"
        title="Finish joining Huddle first."
      />
    );
  }
  if (preview.state === "not-permitted") {
    return (
      <ProfileAccessState
        description="This account cannot submit group applications."
        eyebrow="Not permitted"
        title="This invitation is unavailable."
        warning
      />
    );
  }
  if (preview.state === "unavailable") {
    return (
      <ProfileAccessState
        description="It may be invalid, expired, revoked, exhausted, or unavailable to this account. Huddle does not reveal which condition applies."
        eyebrow="Invitation unavailable"
        title="This invitation cannot be used."
        warning
      />
    );
  }

  const alreadyPending = preview.membershipStatus === "pending";
  const alreadyActive = preview.membershipStatus === "active";

  return (
    <section className="py-12 sm:py-20">
      <Card className="mx-auto max-w-3xl rounded-[2rem]">
        <CardHeader className="px-7 sm:px-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Unlisted group</Badge>
            <Badge variant="outline">Administrator review required</Badge>
          </div>
          <CardTitle className="mt-5 text-4xl font-semibold tracking-[-0.045em] text-foreground">
            <h1>{preview.group.name}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-7 sm:px-10">
          {alreadyPending ? (
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Your application is pending.
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                An active group owner or admin must review it. Reusing this invitation cannot skip
                that decision.
              </p>
            </div>
          ) : alreadyActive ? (
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                You are already an active member.
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                Open the protected group page instead of consuming another invitation use.
              </p>
              <Button asChild className="mt-6">
                <Link href={`/groups/${preview.group.slug}`}>Open group</Link>
              </Button>
            </div>
          ) : (
            <div>
              <p className="mb-6 leading-7 text-muted-foreground">
                This secret link identifies the group, but it does not grant membership. Submit one
                application for an administrator to approve or reject.
              </p>
              <GroupInviteApplicationForm token={token} />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
