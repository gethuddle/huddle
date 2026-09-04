"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FAN_NAVIGATION,
  fanDestinationIsCurrent,
} from "@/features/workspaces/components/fan-bottom-navigation";
import { VenueWorkspaceHeader } from "@/features/workspaces/components/venue-workspace-header";
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher";
import { workspaceLanding } from "@/features/workspaces/state";
import type { WorkspaceShellContext } from "@/features/workspaces/types";
import { cn } from "@/lib/utils";

import { MobileNavigation } from "./mobile-navigation";

export function SiteHeader({
  assistedDiscoveryEnabled,
  context,
  isSignedIn,
}: Readonly<{
  assistedDiscoveryEnabled: boolean;
  context: WorkspaceShellContext;
  isSignedIn: boolean;
}>) {
  const pathname = usePathname();
  const routeVenue = context.available.find(
    (workspace) =>
      workspace.kind === "venue" &&
      workspace.slug !== null &&
      pathname.startsWith(`/venues/${workspace.slug}/workspace`),
  );
  const displayContext = routeVenue === undefined ? context : { ...context, active: routeVenue };
  const homeHref = displayContext.active === null ? "/" : workspaceLanding(displayContext.active);
  const fanActive = displayContext.active?.kind === "fan";
  const venueActive =
    displayContext.active?.kind === "venue" && displayContext.active.slug !== null;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur",
          venueActive && "bg-card/95",
        )}
      >
        <div className="relative mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center justify-between gap-3 px-5 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-10">
          <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
            <Link
              aria-label="Huddle home"
              className="inline-flex min-h-11 shrink-0 items-center gap-3 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={homeHref}
              key={`${homeHref}:${pathname === homeHref ? "current" : "available"}`}
              prefetch={fanActive ? pathname !== homeHref : undefined}
            >
              <BrandMark decorative priority size={28} />
              <span className="text-xl font-semibold tracking-[-0.035em]">Huddle</span>
            </Link>
          </div>

          <div className="hidden min-w-0 items-center justify-center lg:flex">
            {fanActive ? (
              <nav aria-label="Fan navigation" className="flex items-center gap-1.5">
                {FAN_NAVIGATION.filter(
                  ({ href }) => assistedDiscoveryEnabled || href !== "/ask",
                ).map(({ desktopLabel, href }) => {
                  const current = fanDestinationIsCurrent(pathname, href);
                  const exactDestination = pathname === href;
                  return (
                    <Link
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "relative inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:px-5",
                        current &&
                          "text-forest after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-forest",
                      )}
                      href={href}
                      key={`${href}:${exactDestination ? "current" : "available"}`}
                      prefetch={!exactDestination}
                    >
                      {desktopLabel}
                    </Link>
                  );
                })}
              </nav>
            ) : venueActive ? (
              <VenueWorkspaceHeader
                slug={displayContext.active!.slug!}
                venueName={displayContext.active.label}
              />
            ) : displayContext.active === null && !isSignedIn ? (
              <nav aria-label="Public navigation" className="flex items-center gap-1.5">
                <Button
                  asChild
                  className="rounded-full border-border px-5"
                  size="sm"
                  variant="secondary"
                >
                  <Link href="/discover">Explore</Link>
                </Button>
              </nav>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end">
            {displayContext.active === null && !isSignedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Open public navigation"
                    className="sm:hidden"
                    size="icon-lg"
                    variant="ghost"
                  >
                    <Menu aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" aria-label="Public mobile navigation">
                  {[
                    ["Explore", "/discover"],
                    ["Sign up", "/auth/sign-up"],
                    ["Sign in", "/auth/sign-in"],
                  ].map(([label, href]) => (
                    <DropdownMenuItem asChild className="min-h-11" key={href}>
                      <Link href={href}>{label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {isSignedIn && displayContext.active === null ? (
              <Button asChild size="sm">
                <Link href="/onboarding">Choose setup</Link>
              </Button>
            ) : null}
            {isSignedIn && displayContext.active !== null && displayContext.available.length > 0 ? (
              <div className="max-w-[11rem] sm:max-w-[14rem]">
                <WorkspaceSwitcher
                  active={displayContext.active}
                  align="end"
                  appearance="shell"
                  available={displayContext.available}
                />
              </div>
            ) : null}
            {!isSignedIn ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/auth/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/auth/sign-up">Sign up</Link>
                </Button>
              </div>
            ) : null}
          </div>
          {venueActive ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 -bottom-[2px] h-0.5 bg-[linear-gradient(90deg,var(--color-sand),transparent)]"
            />
          ) : null}
        </div>
      </header>
      <MobileNavigation
        assistedDiscoveryEnabled={assistedDiscoveryEnabled}
        context={displayContext}
      />
    </>
  );
}
