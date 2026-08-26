import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InterestViewerState } from "@/features/subscriptions/viewer";

export function InterestAccessPrompt({ state }: Readonly<{ state: InterestViewerState }>) {
  if (state === "eligible") return null;

  const content = {
    anonymous: {
      title: "Sign in to follow interests.",
      description: "Fixtures remain public without an account.",
      href: "/auth/sign-in",
      label: "Sign in",
    },
    "complete-profile": {
      title: "Complete your profile to follow.",
      description: "Verified email, 18+ attestation, and the current rules are required.",
      href: "/settings/profile",
      label: "Complete profile",
    },
    "not-permitted": {
      title: "Follow controls are unavailable.",
      description: "This account cannot change community state.",
      href: null,
      label: null,
    },
  }[state];

  return (
    <Card className="bg-surface-deep" size="sm">
      <CardContent>
        <p className="font-semibold text-linen">{content.title}</p>
        <p className="mt-1 text-sm text-muted-dark">{content.description}</p>
        {content.href === null || content.label === null ? null : (
          <Button asChild className="mt-4" size="sm" variant="outline">
            <Link href={content.href}>{content.label}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
