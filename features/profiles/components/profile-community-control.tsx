import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="bg-surface-deep" size="sm">
      <CardContent>
        <p className="font-semibold text-linen">{content.title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-dark">{content.description}</p>
        {content.href === null || content.action === null ? null : (
          <Button asChild className="mt-4" variant="outline">
            <Link href={content.href}>{content.action}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
