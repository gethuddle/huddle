import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Huddle",
};

export default function SignInPage() {
  return (
    <AuthCard
      description="Use the verified email address and password connected to your Huddle account."
      eyebrow="Welcome back"
      footer={
        <p>
          New to Huddle?{" "}
          <Link className="font-semibold text-court hover:text-court-hover" href="/auth/sign-up">
            Create an account
          </Link>
        </p>
      }
      title="Sign in"
    >
      <SignInForm />
    </AuthCard>
  );
}
