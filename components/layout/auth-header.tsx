import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";

export function AuthHeader() {
  return (
    <header className="border-b border-border bg-card" data-auth-header>
      <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center px-5 sm:px-8 lg:px-10">
        <Link
          aria-label="Huddle home"
          className="inline-flex min-h-11 items-center gap-3 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="/"
        >
          <BrandMark decorative priority size={28} />
          <span className="text-xl font-semibold tracking-[-0.035em]">Huddle</span>
        </Link>
      </div>
    </header>
  );
}
