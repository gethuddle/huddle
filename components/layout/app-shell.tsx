import type { ReactNode } from "react";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative isolate flex min-h-screen overflow-hidden bg-[#f4f1e9] text-[#17211b]">
      <a
        className="absolute left-4 top-4 z-50 -translate-y-24 rounded-full bg-[#173f2a] px-4 py-2 font-semibold text-white transition focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>

      <div
        aria-hidden="true"
        className="absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#c8e2bb]/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#f4c991]/45 blur-3xl"
      />

      <div className="relative flex min-h-screen w-full flex-col">
        <SiteHeader />
        <main
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 sm:px-10 lg:px-14"
          id="main-content"
        >
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
