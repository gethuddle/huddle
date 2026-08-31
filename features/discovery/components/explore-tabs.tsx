import Link from "next/link";

import { cn } from "@/lib/utils";

type ExploreTab = "events" | "groups";

const tabs = [
  { id: "events" as const, href: "/discover", label: "Events" },
  { id: "groups" as const, href: "/groups", label: "Groups" },
];

export function ExploreTabs({ current }: Readonly<{ current: ExploreTab }>) {
  return (
    <nav aria-label="Explore" className="mb-8 flex justify-center">
      <div className="inline-flex rounded-full border border-border bg-muted p-1">
        {tabs.map((tab) => {
          const selected = tab.id === current;
          return (
            <Link
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-muted-foreground outline-none transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected && "bg-card text-foreground",
              )}
              href={tab.href}
              key={tab.id}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
