"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveVenueSpaceAction } from "@/features/venues/workspace/actions";
import type { VenueSpace } from "@/features/venues/workspace/types";

export function VenueSpaceEditor({
  sortOrder,
  space = null,
  venueId,
  canEdit = false,
}: Readonly<{ sortOrder: number; space?: VenueSpace | null; venueId: string; canEdit?: boolean }>) {
  const [state, action, pending] = useActionState(saveVenueSpaceAction, null);
  const prefix = space?.id ?? "new";
  if (!canEdit)
    return space ? (
      <p className="rounded-xl border border-border p-5">
        {space.name} · {space.capacity === null ? "Open door" : `${space.capacity} places`} ·{" "}
        {space.active ? "Active" : "Inactive"}
      </p>
    ) : null;
  return (
    <form action={action} className="rounded-[1.375rem] border border-border bg-card p-5">
      <input name="venueId" type="hidden" value={venueId} />
      <input name="spaceId" type="hidden" value={space?.id ?? ""} />
      <input name="sortOrder" type="hidden" value={sortOrder} />
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <Label htmlFor={`venue-space-name-${prefix}`}>Area name</Label>
          <Input
            defaultValue={space?.name ?? ""}
            id={`venue-space-name-${prefix}`}
            maxLength={120}
            name="name"
            required
          />
        </div>
        <div>
          <Label htmlFor={`venue-space-capacity-${prefix}`}>Capacity</Label>
          <Input
            defaultValue={space?.capacity ?? ""}
            id={`venue-space-capacity-${prefix}`}
            max={100_000}
            min={1}
            name="capacity"
            type="number"
          />
        </div>
      </div>
      <div className="mt-4 flex min-h-11 items-center gap-3">
        <Checkbox
          defaultChecked={space?.active ?? true}
          id={`venue-space-active-${prefix}`}
          name="active"
        />
        <Label className="cursor-pointer" htmlFor={`venue-space-active-${prefix}`}>
          Active and available for future planning
        </Label>
      </div>
      {state === null ? null : state.ok ? (
        <p className="mt-3 text-sm text-forest" role="status">
          {state.data.message}
        </p>
      ) : (
        <Alert className="mt-3" role="alert" variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      )}
      <Button
        className="mt-4"
        disabled={pending}
        type="submit"
        variant={space === null ? "default" : "outline"}
      >
        {pending ? "Saving area…" : space === null ? "Add viewing area" : "Save area"}
      </Button>
    </form>
  );
}
