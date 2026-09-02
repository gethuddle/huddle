import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cancelRecoveryAction } from "@/features/auth/actions";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { hasValidRecoveryGrant } from "@/features/auth/recovery-session";

export const metadata: Metadata = {
  title: "Choose a new password — Huddle",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  if (!(await hasValidRecoveryGrant())) {
    return (
      <AuthCard
        description="Password reset links are short-lived and can be used only once."
        eyebrow="Link unavailable"
        footer={
          <Button asChild variant="link">
            <Link href="/auth/sign-in">Back to sign in</Link>
          </Button>
        }
        title="We couldn’t open that reset link"
      >
        <Alert variant="destructive">
          <AlertDescription>
            Your reset session is no longer available. Request another reset link to continue.
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-5" size="lg">
          <Link href="/auth/forgot-password">Request another reset link</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description="Use a new password with 15–72 characters. We’ll sign out every session after the update."
      eyebrow="Secure your account"
      footer={
        <form action={cancelRecoveryAction}>
          <Button type="submit" variant="link">
            Cancel reset and sign in
          </Button>
        </form>
      }
      title="Choose a new password"
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
