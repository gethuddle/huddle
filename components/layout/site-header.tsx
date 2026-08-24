import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";

export function SiteHeader() {
  return (
    <header className="border-b border-border-dark bg-ink/95">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 sm:px-10 lg:px-14">
        <Link className="inline-flex items-center gap-3" href="/" aria-label="Huddle home">
          <BrandMark decorative priority size={32} />
          <span className="text-xl font-semibold tracking-[-0.03em]">Huddle</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <nav aria-label="Primary navigation" className="hidden sm:block">
            <Link
              className="text-sm font-medium text-muted-dark transition hover:text-linen"
              href="/"
            >
              Home
            </Link>
          </nav>
          <span className="inline-flex items-center gap-2 rounded-full border border-border-dark bg-surface-raised px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-dark sm:px-4 sm:text-xs sm:tracking-[0.16em]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-court" />
            In development
          </span>
        </div>
      </div>
    </header>
  );
}
