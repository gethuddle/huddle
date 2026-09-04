"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FieldError, fieldErrorMessage, fieldFeedback, FocusInvalidFields } from "./field-feedback";
import { VenueSlugField } from "./venue-slug-field";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressSearch } from "@/features/locations/components/address-search";
import type { AddressSuggestion } from "@/features/locations/types";
import {
  updateVenueSettingsAction,
  type VenueWorkspaceMutationState,
} from "@/features/venues/workspace/actions";
import type { VenueFacility } from "@/features/venues/workspace/types";

const FACILITIES = [
  ["wheelchair_accessible", "Wheelchair accessible"],
  ["step_free_access", "Step-free access"],
  ["accessible_toilet", "Accessible toilet"],
  ["hearing_loop", "Hearing loop"],
  ["parking", "Parking"],
  ["food", "Food"],
  ["drinks", "Drinks"],
] as const satisfies readonly (readonly [VenueFacility, string])[];

type VenueSettingsView = Readonly<{
  id: string;
  slug: string;
  name: string;
  addressText: string;
  description: string;
  facilities: readonly VenueFacility[];
  houseInformation: string;
  defaultAttendanceMode: "open_door" | "reservations";
  defaultRequiresApproval: boolean;
}>;

export function VenueSettingsForm({
  venue,
  canEdit = false,
}: Readonly<{ venue: VenueSettingsView; canEdit?: boolean }>) {
  const [changingAddress, setChangingAddress] = useState(false);
  const router = useRouter();
  const [address, setAddress] = useState<AddressSuggestion | null>(null);
  const [attendanceMode, setAttendanceMode] = useState(venue.defaultAttendanceMode);
  const [state, setState] = useState<VenueWorkspaceMutationState>(null);
  const [pending, startTransition] = useTransition();
  const errors = state?.ok === false ? state.error.fields : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateVenueSettingsAction({
        venueId: venue.id,
        name: formData.get("name"),
        slug: formData.get("slug"),
        description: formData.get("description"),
        facilities: formData.getAll("facilities"),
        houseInformation: formData.get("houseInformation"),
        defaultAttendanceMode: attendanceMode,
        defaultRequiresApproval:
          attendanceMode === "reservations" && formData.get("defaultRequiresApproval") === "on",
        address,
      });
      setState(result);
      if (result?.ok === true && result.data.venue.slug !== venue.slug) {
        router.replace(`/venues/${encodeURIComponent(result.data.venue.slug)}/workspace/settings`);
        router.refresh();
      }
    });
  }

  return (
    <FocusInvalidFields errors={errors} pending={pending}>
      <form className="space-y-7" noValidate onSubmit={submit}>
        <fieldset disabled={!canEdit || pending} className="space-y-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="venue-settings-name">Venue name</Label>
              <Input
                defaultValue={venue.name}
                id="venue-settings-name"
                {...fieldFeedback(errors, "name", "venue-settings-name")}
                maxLength={120}
                name="name"
                required
              />
              <FieldError errors={errors} name="name" id="venue-settings-name" />
            </div>
            <VenueSlugField
              currentSlug={venue.slug}
              defaultValue={venue.slug}
              errors={errors?.slug}
              venueId={venue.id}
            />
          </div>

          <section
            className="rounded-[1.375rem] border border-border p-5"
            aria-labelledby="current-venue-address"
          >
            <h2 className="font-semibold" id="current-venue-address">
              Public address
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {address?.label ?? venue.addressText}
            </p>
            {changingAddress ? (
              <div className="mt-5">
                <AddressSearch
                  onConfirm={setAddress}
                  purpose="public_address"
                  error={fieldErrorMessage(errors, "address")}
                />
              </div>
            ) : (
              <Button
                className="mt-4"
                onClick={() => setChangingAddress(true)}
                type="button"
                variant="outline"
              >
                Change public address
              </Button>
            )}
          </section>

          <div>
            <Label htmlFor="venue-settings-description">Public description</Label>
            <Textarea
              defaultValue={venue.description}
              id="venue-settings-description"
              {...fieldFeedback(errors, "description", "venue-settings-description")}
              maxLength={2000}
              minLength={10}
              name="description"
              required
            />
            <FieldError errors={errors} name="description" id="venue-settings-description" />
          </div>

          <fieldset className="rounded-[1.375rem] border border-border p-5">
            <legend className="px-2 font-semibold">Facilities</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {FACILITIES.map(([value, label]) => (
                <div className="flex min-h-11 items-center gap-3" key={value}>
                  <Checkbox
                    defaultChecked={venue.facilities.includes(value)}
                    id={`venue-settings-${value}`}
                    name="facilities"
                    {...fieldFeedback(errors, "facilities", "venue-settings-facilities")}
                    value={value}
                  />
                  <Label className="cursor-pointer" htmlFor={`venue-settings-${value}`}>
                    {label}
                  </Label>
                </div>
              ))}
            </div>
            <FieldError errors={errors} name="facilities" id="venue-settings-facilities" />
          </fieldset>

          <div>
            <Label htmlFor="venue-settings-house-information">House information</Label>
            <Textarea
              defaultValue={venue.houseInformation}
              id="venue-settings-house-information"
              {...fieldFeedback(errors, "houseInformation", "venue-settings-house-information")}
              maxLength={1000}
              name="houseInformation"
            />
            <FieldError
              errors={errors}
              name="houseInformation"
              id="venue-settings-house-information"
            />
          </div>

          <fieldset className="rounded-2xl border border-border p-5">
            <legend className="px-2 font-semibold">Usual attendance</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted p-4 has-[:checked]:border-court">
                <input
                  checked={attendanceMode === "open_door"}
                  className="mt-1 size-4 accent-court"
                  name="defaultAttendanceMode"
                  {...fieldFeedback(errors, "defaultAttendanceMode", "venue-settings-attendance")}
                  onChange={() => setAttendanceMode("open_door")}
                  type="radio"
                  value="open_door"
                />
                <span>
                  <span className="block font-semibold text-foreground">Open door</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    Fans simply come along. No RSVP, invitation, queue, or capacity claim.
                  </span>
                </span>
              </label>
              <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted p-4 has-[:checked]:border-court">
                <input
                  checked={attendanceMode === "reservations"}
                  className="mt-1 size-4 accent-court"
                  name="defaultAttendanceMode"
                  {...fieldFeedback(errors, "defaultAttendanceMode", "venue-settings-attendance")}
                  onChange={() => setAttendanceMode("reservations")}
                  type="radio"
                  value="reservations"
                />
                <span>
                  <span className="block font-semibold text-foreground">Reservations</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    Keep a registered guest list with real area capacity.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <FieldError errors={errors} name="defaultAttendanceMode" id="venue-settings-attendance" />

          {attendanceMode === "reservations" ? (
            <div className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4">
              <Checkbox
                defaultChecked={venue.defaultRequiresApproval}
                id="venue-settings-default-approval"
                name="defaultRequiresApproval"
                {...fieldFeedback(
                  errors,
                  "defaultRequiresApproval",
                  "venue-settings-default-approval",
                )}
              />
              <Label className="cursor-pointer leading-6" htmlFor="venue-settings-default-approval">
                Review attendance requests by default for newly planned events.
              </Label>
            </div>
          ) : null}
          <FieldError
            errors={errors}
            name="defaultRequiresApproval"
            id="venue-settings-default-approval"
          />

          {changingAddress && address === null ? (
            <p className="text-sm text-sand" role="alert">
              Confirm the replacement public address before saving.
            </p>
          ) : null}
          {state === null ? null : state.ok ? (
            <p className="text-sm text-forest" role="status">
              {state.data.message}
            </p>
          ) : (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          )}

          <Button
            disabled={pending || (changingAddress && address === null)}
            size="lg"
            type="submit"
          >
            {pending ? "Saving venue…" : "Save venue"}
          </Button>
        </fieldset>
      </form>
    </FocusInvalidFields>
  );
}
