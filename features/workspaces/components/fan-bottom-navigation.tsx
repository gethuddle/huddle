"use client";

import { Compass, Home, Library, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const FAN_NAVIGATION = [
  { label: "Home", href: "/", icon: Home },
  { label: "Explore", href: "/discover", icon: Compass },
  { label: "My Huddle", href: "/dashboard", icon: Library },
  { label: "People", href: "/people", icon: Search },
  { label: "Account", href: "/account", icon: UserRound },
] as const;

function fanDestinationIsCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/account") {
    return (
      pathname === href ||
      pathname.startsWith("/account/") ||
      pathname.startsWith("/settings/") ||
      pathname === "/reports" ||
      pathname === "/moderation"
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FanBottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Fan mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border-dark bg-ink/98 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 md:hidden"
    >
      {FAN_NAVIGATION.map(({ label, href, icon: Icon }) => {
        const current = fanDestinationIsCurrent(pathname, href);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.68rem] font-semibold text-muted-dark outline-none transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              current && "text-court",
            )}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="size-5" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export { FAN_NAVIGATION, fanDestinationIsCurrent };
