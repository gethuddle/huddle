import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { CommonOnboardingForm } from "@/features/workspaces/components/common-onboarding-form";
import {
  getAppShellState,
  getWorkspaceSetupAvailability,
  listMyRecoverableWorkspaces,
} from "@/features/workspaces/queries";
import { workspaceLanding } from "@/features/workspaces/state";

export const metadata = { title: "Choose your Huddle setup" };

export default async function OnboardingPage() {
  const [state, setupAvailability, recoverable] = await Promise.all([
    getAppShellState(),
    getWorkspaceSetupAvailability(),
    listMyRecoverableWorkspaces().catch(() => null),
  ]);
  if (!state.isSignedIn) {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Sign in to choose a Fan or Venue setup."
        eyebrow="Sign in required"
        title="Continue with your account."
      />
    );
  }
  if (recoverable === null) {
    return (
      <ProfileAccessState
        actionHref="/onboarding"
        actionLabel="Try again"
        description="Your existing workspace state could not be checked. No setup changes were made."
        eyebrow="Temporarily unavailable"
        title="We couldn’t prepare account setup."
        warning
      />
    );
  }
  if (recoverable.length > 0 && state.workspace.active !== null) {
    redirect(workspaceLanding(state.workspace.active));
  }
  if (recoverable.length > 0 && state.workspace.available.length === 0) {
    return (
      <section className="mx-auto my-12 w-full max-w-3xl sm:my-20">
        <p className="text-sm font-medium text-forest">Rules update</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Update the rules, then continue.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
          Your existing {recoverable.length === 1 ? "workspace is" : "workspaces are"} still here.
          Reaccept the current safety rules to return to your last available workspace.
        </p>
        <div className="mt-8 rounded-[1.375rem] border border-border bg-card p-6 sm:p-9">
          <CommonOnboardingForm submitLabel="Reaccept rules and continue" />
        </div>
      </section>
    );
  }
  if (!setupAvailability.canStartFan && !setupAvailability.canStartVenue) {
    return (
      <ProfileAccessState
        actionHref="/account"
        actionLabel="Open Account"
        description="Workspace setup is unavailable for this account. Safety and account controls remain available."
        eyebrow="Setup unavailable"
        title="You can’t start a workspace right now."
        warning
      />
    );
  }

  const hasFan = state.workspace.available.some((workspace) => workspace.kind === "fan");
  const hasVenue = state.workspace.available.some((workspace) => workspace.kind === "venue");

  return (
    <section className="mx-auto my-12 w-full max-w-4xl sm:my-20">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-forest">First setup</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">
          How will you use Huddle?
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Fan and Venue are separate workspaces. You can enable the other one later from Account.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card className="rounded-[1.375rem] shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Use Huddle as a fan</CardTitle>
            <CardDescription className="leading-6">
              Discover and attend events, follow teams, join groups, find people, and host private
              huddles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasFan ? (
              <p className="text-sm font-semibold text-forest">Your Fan workspace is ready.</p>
            ) : setupAvailability.canStartFan ? (
              <Button asChild size="lg">
                <Link href="/onboarding/fan">Set up Fan</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Fan setup is unavailable.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.375rem] shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Set up a venue account</CardTitle>
            <CardDescription className="leading-6">
              Create a dedicated business workspace, plan public fixture events, and manage the
              venue as an authorized owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {setupAvailability.canStartVenue ? (
              <Button asChild size="lg" variant={hasVenue ? "outline" : "default"}>
                <Link href="/onboarding/venue">
                  {hasVenue ? "Set up another venue" : "Set up Venue"}
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Venue setup is unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {hasFan || hasVenue ? (
        <Button asChild className="mt-8" variant="ghost">
          <Link href="/account">Back to Account</Link>
        </Button>
      ) : null}
    </section>
  );
}
