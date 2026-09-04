"use client";

import { Building2, CalendarDays, Clock3, ListVideo } from "lucide-react";
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
  ] as const;
}

function isCurrent(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function VenueWorkspaceHeader({ slug, venueName }: VenueWorkspaceHeaderProps) {
  const pathname = usePathname();
  const navigation = venueNavigation(slug);
  const root = navigation[0].href;

  return (
    <div className="hidden min-w-0 items-center lg:flex" title={venueName}>
      <nav aria-label="Venue navigation" className="flex items-center gap-1.5">
        {navigation.map(({ label, href }) => {
          const current = isCurrent(pathname, href, root);
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "relative inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                current &&
                  "text-forest after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-forest",
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
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card/98 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 [box-shadow:var(--shadow-docked)] lg:hidden"
    >
      {navigation.map(({ label, href, icon: Icon }) => {
        const current = isCurrent(pathname, href, root);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.68rem] font-semibold text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              current && "bg-muted text-forest",
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

export function VenueBillingNavigation({ slug }: Readonly<{ slug: string }>) {
  const pathname = usePathname();
  const href = `/venues/${encodeURIComponent(slug)}/workspace/billing`;
  return (
    <Link
      aria-current={pathname === href ? "page" : undefined}
      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      href={href}
    >
      Billing
    </Link>
  );
}
