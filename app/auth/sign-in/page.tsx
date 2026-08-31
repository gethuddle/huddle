import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeInternalRedirect } from "@/lib/security/redirect";

export const metadata: Metadata = {
  title: "Sign in — Huddle",
};

type SignInPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const rawNext = (await searchParams).next;
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
      <SignInForm nextPath={nextPath === "" ? null : nextPath} />
    </AuthCard>
  );
}
