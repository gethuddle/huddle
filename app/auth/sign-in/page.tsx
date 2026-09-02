import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/features/auth/components/auth-card";
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
  const passwordChanged = (Array.isArray(rawPassword) ? rawPassword[0] : rawPassword) === "changed";
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
      {passwordChanged ? (
        <Alert className="mb-5 border-court/30 bg-court/10" role="status">
          <AlertDescription className="text-forest-hover">
            Password updated. Sign in with your new password.
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
