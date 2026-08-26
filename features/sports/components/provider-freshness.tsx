import { CircleCheck, Clock3 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FixtureFreshness } from "@/features/sports/freshness";

export function ProviderFreshness({ freshness }: Readonly<{ freshness: FixtureFreshness }>) {
  const isFresh = freshness.status === "fresh";

  return (
    <Alert
      className={
        isFresh
          ? "border-court/30 bg-court/10"
          : freshness.status === "stale"
            ? "border-sand/30 bg-sand/10"
            : "border-border-strong bg-surface-deep"
      }
      role="status"
    >
      {isFresh ? (
        <CircleCheck aria-hidden="true" className="text-court" />
      ) : (
        <Clock3 aria-hidden="true" className="text-sand" />
      )}
      <AlertTitle>{isFresh ? "Catalog current" : "Cached fixture catalog"}</AlertTitle>
      <AlertDescription>{freshness.message}</AlertDescription>
    </Alert>
  );
}
