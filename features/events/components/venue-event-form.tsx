import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { VenueEventCatalog } from "@/features/events/catalog";

type VenueEventFormProps = Readonly<{
  catalog: VenueEventCatalog;
  initialMatchId?: string;
  canPrepareDrafts?: boolean;
  venue: Readonly<{
    id: string;
    slug: string;
    name: string;
    addressText: string;
    statedCapacity: number | null;
    verificationStatus: "unverified" | "verified";
  }>;
}>;

/** Compatibility surface for old imports; creation now belongs to the Venue batch planner. */
export function VenueEventForm({
  catalog,
  initialMatchId = "",
  venue,
  canPrepareDrafts = false,
}: VenueEventFormProps) {
  const safeMatchId = catalog.matches.some((match) => match.id === initialMatchId)
    ? initialMatchId
    : "";
  const query = safeMatchId === "" ? "" : `?matchId=${safeMatchId}`;
  return (
    <section className="rounded-[1.375rem] border border-border bg-card p-6">
      <h2 className="text-2xl font-semibold">Plan from the Venue workspace</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {venue.name} now plans one or more fixtures together, with an active viewing area and one
        atomic save.
      </p>
      <Button asChild className="mt-5">
        <Link
          href={
            canPrepareDrafts
              ? `/venues/${venue.slug}/workspace/plan${query}`
              : `/venues/${venue.slug}/workspace/billing`
          }
        >
          {canPrepareDrafts ? "Continue to planner" : "Open Billing"}
        </Link>
      </Button>
    </section>
  );
}
