import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — Huddle",
};

type ForgotPasswordPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const rawStatus = (await searchParams).status;
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;

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
      {status === "expired" ? (
        <Alert className="mb-5" variant="destructive">
          <AlertDescription>
            That reset link is invalid, expired, or has already been used. Request a fresh link
            below.
          </AlertDescription>
        </Alert>
      ) : null}
      <ForgotPasswordForm />
    </AuthCard>
  );
}
