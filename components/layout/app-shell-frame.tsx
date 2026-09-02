"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SiteFooter } from "./site-footer";

type AppShellFrameProps = Readonly<{
  children: ReactNode;
  hasWorkspaceNavigation: boolean;
}>;

export function AppShellFrame({ children, hasWorkspaceNavigation }: AppShellFrameProps) {
  const pathname = usePathname();
  const immersive = pathname === "/ask";

  return (
    <>
      <main
        className={cn(
          "flex w-full flex-col",
          immersive
            ? "h-[calc(100dvh-4.75rem)] min-h-0 max-w-none flex-none overflow-hidden px-0 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
            : "mx-auto max-w-7xl flex-1 px-5 sm:px-8 lg:px-10",
          !immersive && hasWorkspaceNavigation && "pb-20 lg:pb-0",
        )}
        data-shell-mode={immersive ? "immersive" : "standard"}
        id="main-content"
      >
        {children}
      </main>
      {immersive ? null : <SiteFooter />}
    </>
  );
}
