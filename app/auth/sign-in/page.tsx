import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
} from "@/features/auth/session-cleanup-cookie";
import { AuthCard } from "@/features/auth/components/auth-card";
import { HuddleSessionCleanup } from "@/features/auth/components/huddle-session-cleanup";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { getAuthTurnstileSiteKey } from "@/features/auth/turnstile";
import { safeInternalRedirect } from "@/lib/security/redirect";
import { getAppShellState } from "@/features/workspaces/queries";

export const metadata: Metadata = {
  title: "Sign in — Huddle",
};

type SignInPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const state = await getAppShellState();
  if (state.isSignedIn) redirect("/");
  const turnstileSiteKey = getAuthTurnstileSiteKey();

  const query = await searchParams;
  const rawNext = query.next;
  const rawPassword = query.password;
  const rawAccount = query.account;
  const rawSessions = query.sessions;
  const passwordChanged = (Array.isArray(rawPassword) ? rawPassword[0] : rawPassword) === "changed";
  const accountDeleted = (Array.isArray(rawAccount) ? rawAccount[0] : rawAccount) === "deleted";
  const sessionRevocationUnconfirmed =
    passwordChanged &&
    (Array.isArray(rawSessions) ? rawSessions[0] : rawSessions) === "unconfirmed";
  const cleanupMarker =
    accountDeleted || passwordChanged
      ? (await cookies()).get(HUDDLE_SESSION_CLEANUP_COOKIE_NAME)?.value
      : undefined;
  const cleanupPurpose =
    accountDeleted && cleanupMarker === HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.accountErasure
      ? "account-erasure"
      : passwordChanged && cleanupMarker === HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut
        ? "sign-out"
        : null;
  const nextPath = safeInternalRedirect(Array.isArray(rawNext) ? rawNext[0] : rawNext, "");
  return (
    <AuthCard
      description="Use the email address and password connected to your Huddle account."
      eyebrow="Welcome back"
      footer={
        <p>
          New to Huddle?{" "}
          <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-up">
            Create an account
          </Link>
        </p>
      }
      title="Sign in"
    >
      {cleanupPurpose === null ? null : <HuddleSessionCleanup purpose={cleanupPurpose} />}
      {passwordChanged ? (
        <Alert className="mb-5 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-forest-hover">
            Password updated. Sign in with your new password.
          </AlertDescription>
        </Alert>
      ) : null}
      {sessionRevocationUnconfirmed ? (
        <Alert className="mb-5" role="alert" variant="destructive">
          <AlertDescription>
            We couldn’t confirm that every other session ended. This browser is signed out; sign in
            again only on devices you still trust.
          </AlertDescription>
        </Alert>
      ) : null}
      {accountDeleted ? (
        <Alert className="mb-5 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-forest-hover">
            Account deleted. Your public profile and private account data have been removed.
          </AlertDescription>
        </Alert>
      ) : null}
      <SignInForm
        nextPath={nextPath === "" ? null : nextPath}
        turnstileSiteKey={turnstileSiteKey}
      />
    </AuthCard>
  );
}
