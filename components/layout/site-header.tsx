import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

import { AccountNavigation } from "./account-navigation";
import { MobileNavigation } from "./mobile-navigation";

export function SiteHeader({
  isModerator,
  isProfileComplete,
  isSignedIn,
}: Readonly<{ isModerator: boolean; isProfileComplete: boolean; isSignedIn: boolean }>) {
  return (
    <header className="border-b border-border-dark bg-ink/95">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-10 lg:px-14">
        <Link className="inline-flex shrink-0 items-center gap-3" href="/" aria-label="Huddle home">
          <BrandMark decorative priority size={32} />
          <span className="text-xl font-semibold tracking-[-0.03em]">Huddle</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <nav aria-label="Primary navigation" className="hidden items-center gap-6 xl:flex">
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/matches"
            >
              Fixtures
            </Link>
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/discover"
            >
              Discover
            </Link>
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/groups"
            >
              Groups
            </Link>
            {isSignedIn && isProfileComplete ? (
              <Link
                className="text-sm font-medium text-muted-dark transition hover:text-linen"
                href="/dashboard"
              >
                My Huddle
              </Link>
            ) : null}
          </nav>
          <MobileNavigation
            isModerator={isModerator}
            isProfileComplete={isProfileComplete}
            isSignedIn={isSignedIn}
          />
          {isSignedIn ? (
            <>
              {isProfileComplete ? (
                <>
                  <Button asChild className="hidden xl:inline-flex" size="sm">
                    <Link href="/events/new">Host event</Link>
                  </Button>
                  <div className="hidden xl:block">
                    <AccountNavigation isModerator={isModerator} />
                  </div>
                </>
              ) : (
                <Button asChild className="hidden xl:inline-flex" size="sm">
                  <Link href="/settings/profile">Finish setup</Link>
                </Button>
              )}
              <SignOutButton />
            </>
          ) : (
            <div className="hidden items-center gap-2 xl:flex">
              <Button asChild size="sm" variant="ghost">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/sign-up">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
