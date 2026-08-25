import Link from "next/link";

import type { PublicProfileViewerState } from "@/features/profiles/viewer";
import { BlockControl } from "@/features/safety/components/block-control";

type ProfileCommunityControlProps = Readonly<{
  viewerState: PublicProfileViewerState;
  targetHandle: string;
  viewerHasBlocked: boolean;
}>;

export function ProfileCommunityControl({
  viewerState,
  targetHandle,
  viewerHasBlocked,
}: ProfileCommunityControlProps) {
  if (viewerState === "eligible") {
    return <BlockControl initiallyBlocked={viewerHasBlocked} targetHandle={targetHandle} />;
  }

  const content = {
    anonymous: {
      title: "Sign in for community controls.",
      description: "Public profile details remain available without an account.",
      href: "/auth/sign-in",
      action: "Sign in",
    },
    "complete-profile": {
      title: "Complete your profile to interact.",
      description: "Verified email, 18+ attestation, and the current rules are required.",
      href: "/settings/profile",
      action: "Complete profile",
    },
    "not-permitted": {
      title: "Community controls are not permitted.",
      description: "This account cannot change community relationships.",
      href: null,
      action: null,
    },
    self: {
      title: "This is your public profile.",
      description: "Only the safe details shown here are visible to other people.",
      href: "/settings/profile",
      action: "Edit profile",
    },
  }[viewerState];

  return (
    <div className="rounded-2xl border border-border-dark bg-surface-deep p-5">
      <p className="font-semibold text-linen">{content.title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-dark">{content.description}</p>
      {content.href === null || content.action === null ? null : (
        <Link
          className="mt-4 inline-flex rounded-xl border border-border-strong px-4 py-2.5 text-sm font-semibold text-linen transition hover:border-court hover:text-court focus-visible:outline-2 focus-visible:outline-offset-2"
          href={content.href}
        >
          {content.action}
        </Link>
      )}
    </div>
  );
}
