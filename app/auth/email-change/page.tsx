import Link from "next/link";
import { cookies } from "next/headers";
import { HuddleSessionCleanup } from "@/features/auth/components/huddle-session-cleanup";
import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
} from "@/features/auth/session-cleanup-cookie";
import { AuthCard } from "@/features/auth/components/auth-card";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Email confirmation — Huddle",
  robots: { index: false, follow: false },
};
export default async function EmailChangeResultPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const received = (await searchParams).status === "received";
  const cleanup =
    (await cookies()).get(HUDDLE_SESSION_CLEANUP_COOKIE_NAME)?.value ===
    HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut;
  return (
    <AuthCard
      eyebrow="Account email"
      title={received ? "Confirmation received" : "Link unavailable"}
      description={
        received
          ? "Complete the confirmation links sent to both your current and new inboxes. After both confirmations, sign in with your new email address."
          : "This link is invalid, expired, or already used. Sign in and request another email change from Account security."
      }
      footer={null}
    >
      {cleanup ? <HuddleSessionCleanup purpose="sign-out" /> : null}
      <p className="text-sm text-muted-foreground">
        This page does not sign you in or confirm that both verification steps are complete.
      </p>
      <Button asChild className="mt-5 w-full">
        <Link href="/auth/sign-in?next=%2Faccount%2Fsecurity">Sign in to continue</Link>
      </Button>
    </AuthCard>
  );
}
