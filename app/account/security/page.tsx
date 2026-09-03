import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { getAppShellState } from "@/features/workspaces/queries";

export const metadata = { title: "Account security — Huddle" };

export default async function AccountSecurityPage() {
  const state = await getAppShellState();
  if (!state.isSignedIn) {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Sign in before changing this account’s password."
        eyebrow="Sign in required"
        title="Account security is private."
      />
    );
  }

  return (
    <section className="mx-auto my-12 w-full max-w-2xl sm:my-16">
      <p className="text-sm font-medium text-forest">Account security</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Change your password.</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        Confirm the current password, then choose a new one. Huddle signs out every session after a
        successful change.
      </p>

      <Card className="mt-10 rounded-[1.375rem] shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Password</CardTitle>
          <CardDescription>Use 15–72 characters for the new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
          <p className="mt-5 text-center text-sm text-muted-foreground">
            <Link
              className="font-semibold text-forest hover:text-forest-hover"
              href="/auth/forgot-password"
            >
              Forgot your current password?
            </Link>{" "}
            Recover access by email instead.
          </p>
        </CardContent>
      </Card>

      <Button asChild className="mt-5" variant="ghost">
        <Link href="/account">Back to Account</Link>
      </Button>
    </section>
  );
}
