"use client";

import { Building2, CalendarDays, CircleUserRound, Clock3, ListVideo } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type VenueWorkspaceHeaderProps = Readonly<{
  slug: string;
  venueName: string;
}>;

function venueNavigation(slug: string) {
  const root = `/venues/${encodeURIComponent(slug)}/workspace`;
  return [
    { label: "Today", href: root, icon: Clock3 },
    { label: "Calendar", href: `${root}/calendar`, icon: CalendarDays },
    { label: "Events", href: `${root}/events`, icon: ListVideo },
    { label: "Venue", href: `${root}/settings`, icon: Building2 },
    { label: "Account", href: "/account", icon: CircleUserRound },
  ] as const;
}

function isCurrent(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  if (href === "/account") return pathname === href || pathname.startsWith("/account/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function VenueWorkspaceHeader({ slug, venueName }: VenueWorkspaceHeaderProps) {
  const pathname = usePathname();
  const navigation = venueNavigation(slug);
  const root = navigation[0].href;

  return (
    <div className="hidden min-w-0 items-center md:flex" title={venueName}>
      <nav aria-label="Venue navigation" className="flex items-center gap-1.5">
        {navigation.map(({ label, href }) => {
          const current = isCurrent(pathname, href, root);
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted-dark transition hover:bg-surface-raised hover:text-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                current && "bg-border-dark text-linen",
              )}
              href={href}
              key={href}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function VenueMobileNavigation({ slug }: Pick<VenueWorkspaceHeaderProps, "slug">) {
  const pathname = usePathname();
  const navigation = venueNavigation(slug);
  const root = navigation[0].href;

  return (
    <nav
      aria-label="Venue mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border-dark bg-ink/98 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 md:hidden"
    >
      {navigation.map(({ label, href, icon: Icon }) => {
        const current = isCurrent(pathname, href, root);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.68rem] font-semibold text-muted-dark outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              current && "text-court",
            )}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export { venueNavigation };
