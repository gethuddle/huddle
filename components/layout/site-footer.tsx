import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border-dark">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-muted-dark sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-14">
        <p className="flex items-center gap-2">
          <BrandMark decorative size={18} tone="linen" />
          <span>Huddle · Israel pilot · One account, one attendee.</span>
        </p>
        <p>
          Fixtures by{" "}
          <a
            className="text-linen underline underline-offset-4"
            href="https://www.football-data.org/"
            rel="noreferrer"
            target="_blank"
          >
            football-data.org
          </a>
          {" · "}
          <Link className="text-linen underline underline-offset-4" href="/data-sources">
            Data sources
          </Link>
        </p>
      </div>
    </footer>
  );
}
