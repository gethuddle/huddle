import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export async function AppShell({ children }: AppShellProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const viewerId = typeof data?.claims.sub === "string" ? data.claims.sub : null;
  const isSignedIn = viewerId !== null;
  let isModerator = false;
  let isProfileComplete = false;

  if (viewerId !== null) {
    const [moderatorResult, profileResult] = await Promise.all([
      supabase.rpc("viewer_is_platform_moderator"),
      supabase.from("profiles").select("profile_completed_at").eq("id", viewerId).maybeSingle(),
    ]);
    isModerator = moderatorResult.data === true;
    isProfileComplete =
      profileResult.error === null &&
      profileResult.data?.profile_completed_at !== null &&
      profileResult.data?.profile_completed_at !== undefined;
  }

  return (
    <div className="flex min-h-screen bg-ink text-linen">
      <a
        className="absolute left-4 top-4 z-50 -translate-y-24 rounded-xl bg-court px-4 py-2 font-semibold text-ink transition hover:bg-court-hover focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>

      <div className="flex min-h-screen w-full flex-col">
        <SiteHeader
          isModerator={isModerator}
          isProfileComplete={isProfileComplete}
          isSignedIn={isSignedIn}
        />
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
