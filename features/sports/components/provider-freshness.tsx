import { CircleCheck, Clock3 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FixtureFreshness } from "@/features/sports/freshness";

export function ProviderFreshness({ freshness }: Readonly<{ freshness: FixtureFreshness }>) {
  const isCurrentAndSeasonSpanning =
    freshness.status === "fresh" && freshness.coverageStatus === "available";

  return (
    <Alert
      className={
        isCurrentAndSeasonSpanning ? "border-court/30 bg-court/10" : "border-sand/30 bg-sand/10"
      }
      role="status"
    >
      {isCurrentAndSeasonSpanning ? (
        <CircleCheck aria-hidden="true" className="text-forest" />
      ) : (
        <Clock3 aria-hidden="true" className="text-sand" />
      )}
      <AlertTitle>Fixture availability</AlertTitle>
      <AlertDescription>
        <p>
          <span className="font-semibold text-foreground">Updated</span> {freshness.updatedLabel}
        </p>
        <p>
          <span className="font-semibold text-foreground">Fixtures available through</span>{" "}
          {freshness.coverageLabel}
        </p>
        {freshness.status === "stale" ? (
          <p>Updates are delayed, so fixture details may have changed.</p>
        ) : null}
        {freshness.coverageStatus === "short" ? (
          <p>Later fixtures are not yet available. Check again after the next update.</p>
        ) : null}
        {freshness.status === "unknown" && freshness.coverageStatus === "unknown" ? (
          <p>Availability will appear after the first successful update.</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
