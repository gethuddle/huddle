import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export function SiteHeader({ isSignedIn }: Readonly<{ isSignedIn: boolean }>) {
  return (
    <header className="border-b border-border-dark bg-ink/95">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 sm:px-10 lg:px-14">
        <Link className="inline-flex items-center gap-3" href="/" aria-label="Huddle home">
          <BrandMark decorative priority size={32} />
          <span className="text-xl font-semibold tracking-[-0.03em]">Huddle</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-5">
          <nav aria-label="Primary navigation" className="hidden sm:flex sm:items-center sm:gap-5">
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/"
            >
              Home
            </Link>
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/matches"
            >
              Fixtures
            </Link>
          </nav>
          {isSignedIn ? (
            <>
              <Button asChild className="hidden lg:inline-flex" size="sm" variant="ghost">
                <Link href="/settings/interests">Interests</Link>
              </Button>
              <Button asChild className="hidden lg:inline-flex" size="sm" variant="ghost">
                <Link href="/settings/friends">Friends</Link>
              </Button>
              <Button asChild className="hidden xl:inline-flex" size="sm" variant="ghost">
                <Link href="/groups/new">Create group</Link>
              </Button>
              <Button asChild className="hidden xl:inline-flex" size="sm" variant="ghost">
                <Link href="/venues/new">Create venue</Link>
              </Button>
              <Button asChild className="hidden lg:inline-flex" size="sm">
                <Link href="/events/new">Host event</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/settings/profile">Profile</Link>
              </Button>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/sign-up">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
