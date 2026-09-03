import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { getAuthTurnstileSiteKey } from "@/features/auth/turnstile";
import { getAppShellState } from "@/features/workspaces/queries";

export const metadata: Metadata = {
  title: "Reset your password — Huddle",
};

type ForgotPasswordPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const state = await getAppShellState();
  const turnstileSiteKey = getAuthTurnstileSiteKey();

  const rawStatus = (await searchParams).status;
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;

  if (status === "sent") {
    return (
      <AuthCard
        description="If that address can receive Huddle mail, a password reset link is on its way. The link is short-lived and can be used only once."
        descriptionRole="status"
        eyebrow="Email sent"
        footer={
          <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-in">
            Return to sign in
          </Link>
        }
        title="Check your inbox"
      >
        <p className="leading-7 text-muted-foreground">
          No message yet? Check spam, wait a minute, or return here to request another link.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description="Enter the email connected to your Huddle account. We’ll send a secure reset link if that address can receive Huddle mail."
      eyebrow="Account recovery"
      footer={
        <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-in">
          Back to sign in
        </Link>
      }
      title="Reset your password"
    >
      {state.isSignedIn ? (
        <Alert className="mb-5">
          <AlertDescription>
            You’re currently signed in. You can still request recovery for this or another account;
            Huddle switches accounts only after you open the email and continue.
          </AlertDescription>
        </Alert>
      ) : null}
      {status === "expired" ? (
        <Alert className="mb-5" variant="destructive">
          <AlertDescription>
            That reset link is invalid, expired, or has already been used. Request a fresh link
            below.
          </AlertDescription>
        </Alert>
      ) : null}
      <ForgotPasswordForm turnstileSiteKey={turnstileSiteKey} />
    </AuthCard>
  );
}
