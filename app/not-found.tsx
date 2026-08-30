import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { getAppShellState } from "@/features/workspaces/queries";
import { workspaceLanding } from "@/features/workspaces/state";
import type { AppShellState } from "@/features/workspaces/types";

export default async function NotFound() {
  let state: AppShellState | null = null;
  try {
    state = await getAppShellState();
  } catch {
    // The generic recovery remains useful even when session context cannot be read.
  }

  const primaryRecovery = !state?.isSignedIn
    ? { href: "/auth/sign-in", label: "Sign in" }
    : state.workspace.active?.kind === "fan"
      ? { href: "/dashboard", label: "Open My Huddle" }
      : state.workspace.active?.kind === "venue"
        ? { href: workspaceLanding(state.workspace.active), label: "Open Venue workspace" }
        : { href: "/onboarding", label: "Choose setup" };

  return (
    <EmptyState
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href={primaryRecovery.href}>{primaryRecovery.label}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/discover">Browse events</Link>
          </Button>
        </div>
      }
      description="The page may have moved, may not exist, or may not be visible to you. Huddle uses the same response for missing and private pages."
      title="This page isn’t available."
    />
  );
}
