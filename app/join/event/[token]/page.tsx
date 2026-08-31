import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventInviteRedemptionForm } from "@/features/attendance/components/event-invite-redemption-form";
import { getEventInviteEntryState } from "@/features/attendance/invite-links";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";

export const metadata: Metadata = { title: "Event invitation — Huddle" };

type EventInvitePageProps = Readonly<{
  params: Promise<Readonly<{ token: string }>>;
}>;

export default async function EventInvitePage({ params }: EventInvitePageProps) {
  const { token } = await params;
  const entry = await getEventInviteEntryState(token);

  if (entry.state === "anonymous") {
    const next = `/join/event/${entry.token}`;
    return (
      <ProfileAccessState
        actionHref={`/auth/sign-in?next=${encodeURIComponent(next)}`}
        actionLabel="Sign in"
        description="Sign in with the Huddle account that should receive this invitation. The link never admits anonymous guests."
        eyebrow="Private event"
        title="Sign in to continue."
      />
    );
  }
  if (entry.state === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/onboarding"
        actionLabel="Finish setup"
        description="Activate your Fan workspace, confirm the community rules, and then reopen this invitation."
        eyebrow="Fan setup required"
        title="Finish your account first."
      />
    );
  }
  if (entry.state === "not-permitted" || entry.state === "unavailable") {
    return (
      <ProfileAccessState
        description="The link may be invalid, expired, revoked, used up, or unavailable to this account. Huddle does not reveal which condition applies."
        eyebrow="Invitation unavailable"
        title="This invitation cannot be used."
        warning
      />
    );
  }

  return (
    <section className="py-12 sm:py-20">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <p className="text-sm font-medium text-forest">Private event invitation</p>
          <CardTitle className="mt-3 text-3xl tracking-[-0.04em]">Review before joining</CardTitle>
        </CardHeader>
        <CardContent>
          <EventInviteRedemptionForm token={entry.token} />
        </CardContent>
      </Card>
    </section>
  );
}
