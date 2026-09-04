import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher";
import { getAppShellState, getWorkspaceSetupAvailability } from "@/features/workspaces/queries";

export const metadata = { title: "Account — Huddle" };

export default async function AccountPage() {
  const [state, setupAvailability] = await Promise.all([
    getAppShellState(),
    getWorkspaceSetupAvailability(),
  ]);
  if (!state.isSignedIn) {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Sign in to manage identity, preferences, safety, and workspaces."
        eyebrow="Sign in required"
        title="Your account is private."
      />
    );
  }

  const fan = state.workspace.available.find((workspace) => workspace.kind === "fan");

  return (
    <section className="mx-auto my-12 w-full max-w-5xl sm:my-16">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-forest">Account</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Your Huddle, in one place.
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Switch workspaces, update identity and interests, or reach safety controls.
        </p>
      </div>

      <Card className="mt-10 rounded-[1.375rem] shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Workspace</CardTitle>
          <CardDescription>Choose the Fan or business context you want to use.</CardDescription>
        </CardHeader>
        <CardContent>
          {state.workspace.available.length === 0 ? (
            setupAvailability.canStartFan || setupAvailability.canStartVenue ? (
              <Button asChild size="lg">
                <Link href="/onboarding">Choose your first setup</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Workspace setup is unavailable for this account. Safety controls remain below.
              </p>
            )
          ) : (
            <WorkspaceSwitcher
              active={state.workspace.active}
              align="start"
              available={state.workspace.available}
            />
          )}
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card className="rounded-[1.375rem] shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Account security</CardTitle>
            <CardDescription>
              Change your email or password, or permanently delete your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/account/security">Manage security</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[1.375rem] shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Fan identity</CardTitle>
            <CardDescription>
              {fan === undefined
                ? "Enable Fan to attend, follow interests, use groups, and find people."
                : "Keep your public identity and followed interests current."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {fan === undefined ? (
              setupAvailability.canStartFan ? (
                <Button asChild>
                  <Link href="/onboarding/fan">Set up Fan</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fan setup is unavailable for this account.
                </p>
              )
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link href="/settings/profile">Profile and username</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/settings/interests">Interests</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.375rem] shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Venue account</CardTitle>
            <CardDescription>
              Create a dedicated self-listed business workspace without changing your Fan identity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {setupAvailability.canStartVenue ? (
              <Button asChild variant="outline">
                <Link href="/onboarding/venue">Set up a venue</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Venue setup is unavailable for this account.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.375rem] shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              <h2>Safety center</h2>
            </CardTitle>
            <CardDescription>Block or report concerns and review your own reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/reports">Open Safety center</Link>
            </Button>
          </CardContent>
        </Card>

        {state.workspace.isModerator ? (
          <Card className="rounded-[1.375rem] shadow-none">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Platform moderation</CardTitle>
              <CardDescription>
                Review confidential reports through your authorized queue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/moderation">Open moderation</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="mt-8 border-t border-border pt-8">
        <SignOutButton />
      </div>
    </section>
  );
}
