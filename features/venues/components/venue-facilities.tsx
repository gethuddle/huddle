import { Badge } from "@/components/ui/badge";

import type { VenueFacility } from "../schemas";

const FACILITY_LABELS: Record<VenueFacility, string> = {
  wheelchair_accessible: "Wheelchair accessible",
  step_free_access: "Step-free access",
  accessible_toilet: "Accessible toilet",
  hearing_loop: "Hearing loop",
  parking: "Parking",
  food: "Food",
  drinks: "Drinks",
};

export function VenueFacilities({
  facilities,
}: Readonly<{ facilities: readonly VenueFacility[] }>) {
  if (facilities.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="text-sm font-medium text-muted-foreground">Self-reported venue facilities</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {facilities.map((facility) => (
          <Badge key={facility} variant="outline">
            {FACILITY_LABELS[facility]}
          </Badge>
        ))}
      </div>
    </div>
  );
}
