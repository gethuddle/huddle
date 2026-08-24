import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="relative">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between border-b border-[#17211b]/15 px-6 py-6 sm:px-10 lg:px-14">
        <Link className="inline-flex items-center gap-3" href="/" aria-label="Huddle home">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-[#173f2a] text-sm font-bold text-[#f8f4e9]"
          >
            H
          </span>
          <span className="text-xl font-semibold tracking-[-0.03em]">Huddle</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <nav aria-label="Primary navigation" className="hidden sm:block">
            <Link
              className="text-sm font-semibold text-[#27573c] underline-offset-4 hover:underline"
              href="/"
            >
              Home
            </Link>
          </nav>
          <span className="rounded-full border border-[#173f2a]/25 bg-white/50 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#27573c] sm:px-4 sm:text-xs sm:tracking-[0.16em]">
            Under development
          </span>
        </div>
      </div>
    </header>
  );
}
