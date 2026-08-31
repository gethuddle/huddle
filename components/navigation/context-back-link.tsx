import Link from "next/link";

import { Button } from "@/components/ui/button";

const EXPLORE_PATHS = ["/discover", "/groups"] as const;

export function safeExploreReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;

  try {
    const url = new URL(value, "https://huddle.local");
    if (url.origin !== "https://huddle.local") return null;
    const allowed = EXPLORE_PATHS.some(
      (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
    );
    return allowed ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

export function ContextBackLink({
  fallbackHref,
  label = "Back to Explore",
  returnTo,
}: Readonly<{ fallbackHref: string; label?: string; returnTo: unknown }>) {
  return (
    <Button asChild variant="ghost">
      <Link href={safeExploreReturnTo(returnTo) ?? fallbackHref}>
        <span aria-hidden="true">←</span>
        {label}
      </Link>
    </Button>
  );
}
