import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = {
  title: "Create an account — Huddle",
};

export default function SignUpPage() {
  return (
    <AuthCard
      description="Start with an email and password. You will need to verify the address before completing your Huddle profile."
      eyebrow="Join Huddle"
      footer={
        <p>
          Already have an account?{" "}
          <Link className="font-semibold text-court hover:text-court-hover" href="/auth/sign-in">
            Sign in
          </Link>
        </p>
      }
      title="Create your account"
    >
      <SignUpForm />
    </AuthCard>
  );
}
