import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
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
          <nav aria-label="Primary navigation" className="hidden sm:block">
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/"
            >
              Home
            </Link>
          </nav>
          {isSignedIn ? (
            <>
              <span className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-court sm:inline-flex">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-court" />
                Signed in
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                className="text-sm font-semibold text-muted-dark transition hover:text-linen"
                href="/auth/sign-in"
              >
                Sign in
              </Link>
              <Link
                className="rounded-xl bg-court px-3 py-2 text-sm font-semibold text-ink transition hover:bg-court-hover sm:px-4"
                href="/auth/sign-up"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
