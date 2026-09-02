import type { ReactNode } from "react";

import { getAppShellState } from "@/features/workspaces/queries";
import { getServerEnvironment } from "@/lib/env/server";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export async function AppShell({ children }: AppShellProps) {
  const state = await getAppShellState();
  const assistedDiscoveryEnabled = getServerEnvironment().ASSISTED_DISCOVERY_ENABLED;
  const hasWorkspaceNavigation = state.workspace.active !== null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a
        className="absolute left-4 top-4 z-50 -translate-y-24 rounded-xl bg-court px-4 py-2 font-semibold text-ink transition hover:bg-court-hover focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>

      <div className="flex min-h-screen w-full flex-col">
        <SiteHeader
          assistedDiscoveryEnabled={assistedDiscoveryEnabled}
          context={state.workspace}
          isSignedIn={state.isSignedIn}
        />
        <main
          className={`mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 sm:px-8 lg:px-10 ${hasWorkspaceNavigation ? "pb-20 lg:pb-0" : ""}`}
          id="main-content"
        >
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
