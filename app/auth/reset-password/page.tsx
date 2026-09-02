import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password — Huddle",
};

export default async function ResetPasswordPage() {
  let hasSession = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    hasSession = error === null && data.user !== null;
  } catch {
    hasSession = false;
  }

  if (!hasSession) {
    return (
      <AuthCard
        description="Password reset links are short-lived and can be used only once."
        eyebrow="Link unavailable"
        footer={
          <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-in">
            Back to sign in
          </Link>
        }
        title="We couldn’t open that reset link"
      >
        <Alert variant="destructive">
          <AlertDescription>
            Your reset session is no longer available. Request another reset link to continue.
          </AlertDescription>
        </Alert>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-court-hover"
          href="/auth/forgot-password"
        >
          Request another reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description="Use a new password with 8–72 characters. After the update, you’ll return to sign in."
      eyebrow="Secure your account"
      footer={
        <Link className="font-semibold text-forest hover:text-forest-hover" href="/auth/sign-in">
          Back to sign in
        </Link>
      }
      title="Choose a new password"
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
