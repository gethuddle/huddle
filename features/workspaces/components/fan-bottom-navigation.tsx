"use client";

import { Compass, Home, Library, MessageCircleQuestion, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const FAN_NAVIGATION = [
  { label: "Home", desktopLabel: "Home", href: "/", icon: Home },
  { label: "Explore", desktopLabel: "Explore", href: "/discover", icon: Compass },
  { label: "Ask", desktopLabel: "Ask Huddle", href: "/ask", icon: MessageCircleQuestion },
  { label: "My Huddle", desktopLabel: "My Huddle", href: "/dashboard", icon: Library },
  { label: "People", desktopLabel: "People", href: "/people", icon: Search },
] as const;

function fanDestinationIsCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/discover") {
    return ["/discover", "/groups", "/matches"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FanBottomNavigation({
  assistedDiscoveryEnabled,
}: Readonly<{ assistedDiscoveryEnabled: boolean }>) {
  const pathname = usePathname();
  const navigation = FAN_NAVIGATION.filter(
    ({ href }) => assistedDiscoveryEnabled || href !== "/ask",
  );

  return (
    <nav
      aria-label="Fan mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-card/98 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 [box-shadow:var(--shadow-docked)] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${navigation.length}, minmax(0, 1fr))` }}
    >
      {navigation.map(({ label, href, icon: Icon }) => {
        const current = fanDestinationIsCurrent(pathname, href);
        const emphasized = href === "/ask";
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.68rem] font-semibold text-muted-foreground outline-none transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              emphasized && "text-forest",
              current && "text-forest",
              current && !emphasized && "bg-muted",
            )}
            href={href}
            key={href}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-5 items-center justify-center",
                emphasized &&
                  "size-9 rounded-full bg-primary text-primary-foreground [box-shadow:var(--shadow-search)]",
                current && emphasized && "ring-2 ring-forest ring-offset-2 ring-offset-card",
              )}
              data-slot={emphasized ? "ask-navigation-mark" : undefined}
            >
              <Icon className={emphasized ? "size-[1.125rem]" : "size-5"} />
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export { FAN_NAVIGATION, fanDestinationIsCurrent };
