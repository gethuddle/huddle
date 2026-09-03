import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { getAuthTurnstileSiteKey } from "@/features/auth/turnstile";
import { getAppShellState } from "@/features/workspaces/queries";

export const metadata: Metadata = {
  title: "Create an account — Huddle",
};

export default async function SignUpPage() {
  const state = await getAppShellState();
  if (state.isSignedIn) redirect("/");
  const turnstileSiteKey = getAuthTurnstileSiteKey();

  return (
    <AuthCard
      description="Start with an email and password. You will need to verify the address before completing your Huddle profile."
      eyebrow="Join Huddle"
      footer={
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <p>
            Already have an account?{" "}
            <Link
              className="font-semibold text-forest hover:text-forest-hover"
              href="/auth/sign-in"
            >
              Sign in
            </Link>
          </p>
          <Link
            className="font-semibold text-forest hover:text-forest-hover"
            href="/auth/forgot-password"
          >
            Reset your password
          </Link>
        </div>
      }
      title="Create your account"
    >
      <SignUpForm turnstileSiteKey={turnstileSiteKey} />
    </AuthCard>
  );
}
