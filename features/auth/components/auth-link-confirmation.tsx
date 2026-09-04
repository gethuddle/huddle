"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import {
  parseAuthLinkCredential,
  type AuthLinkCredential,
  type AuthLinkPurpose,
} from "@/features/auth/link-consumption";

type AuthLinkConfirmationProps = Readonly<{ purpose: AuthLinkPurpose }>;

function subscribeToStaticFragment() {
  return () => undefined;
}

export function AuthLinkConfirmation({ purpose }: AuthLinkConfirmationProps) {
  const fragmentSnapshot = useSyncExternalStore(
    subscribeToStaticFragment,
    () => window.location.hash,
    () => null,
  );
  const credential: AuthLinkCredential | null | undefined =
    fragmentSnapshot === null ? undefined : parseAuthLinkCredential(fragmentSnapshot, purpose);

  useEffect(() => {
    if (fragmentSnapshot === null) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [fragmentSnapshot]);

  if (credential === undefined) {
    return (
      <AuthCard
        description="Checking the secure link in this browser."
        eyebrow="Huddle account"
        footer={null}
        title="Preparing your link…"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          One moment…
        </p>
      </AuthCard>
    );
  }

  if (credential === null) {
    const requestHref =
      purpose === "email_change"
        ? "/account/security"
        : purpose === "email"
          ? "/auth/sign-up"
          : "/auth/forgot-password";
    return (
      <AuthCard
        description="For your security, Huddle links are short-lived and can be used only once."
        eyebrow="Link unavailable"
        footer={
          <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-in">
            Back to sign in
          </Link>
        }
        title="We couldn’t open that link"
      >
        <Alert variant="destructive">
          <AlertDescription>
            This link is invalid, expired, or already used. Request a fresh email to continue.
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-5" size="lg">
          <Link href={requestHref}>
            {purpose === "email_change"
              ? "Return to account security"
              : purpose === "email"
                ? "Request another email"
                : "Request another reset link"}
          </Link>
        </Button>
      </AuthCard>
    );
  }

  const action =
    purpose === "email_change"
      ? "/auth/email-change/confirm/consume"
      : purpose === "email"
        ? "/auth/verify/confirm/consume"
        : "/auth/reset-password/confirm/consume";

  function markSubmitting(event: FormEvent<HTMLFormElement>) {
    const submitButton =
      event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton === null) return;
    submitButton.disabled = true;
    submitButton.textContent = "Continuing…";
  }

  return (
    <AuthCard
      description={
        purpose === "email_change"
          ? "Complete the confirmation links sent to both email addresses. Opening this page alone does not change your email."
          : purpose === "email"
            ? "Confirm this browser before Huddle verifies the email address."
            : "Confirm this browser before Huddle opens the password reset form."
      }
      eyebrow="Secure link"
      footer={
        <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-in">
          Cancel and sign in
        </Link>
      }
      title={
        purpose === "email_change"
          ? "Confirm email change"
          : purpose === "email"
            ? "Verify your email"
            : "Reset your password"
      }
    >
      <Alert>
        <AlertDescription>
          Continuing may switch the account currently signed in on this browser. We won’t reveal
          which account this link belongs to before it is verified.
        </AlertDescription>
      </Alert>
      <form action={action} className="mt-5" method="post" onSubmit={markSubmitting}>
        {credential.kind === "code" ? (
          <input name="code" type="hidden" value={credential.code} />
        ) : (
          <>
            <input name="token_hash" type="hidden" value={credential.tokenHash} />
            <input name="type" type="hidden" value={credential.type} />
          </>
        )}
        <Button className="w-full" size="lg" type="submit">
          Continue securely
        </Button>
      </form>
    </AuthCard>
  );
}
