"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
  cityId: string;
  cityName: string;
  addressText: string;
  description: string;
  facilities: readonly VenueFacility[];
  houseInformation: string;
  defaultAttendanceMode: "open_door" | "reservations";
  defaultRequiresApproval: boolean;
}>;

export function VenueSettingsForm({
  cities,
  venue,
}: Readonly<{
  cities: readonly Readonly<{ id: string; name: string; slug?: string }>[];
  venue: VenueSettingsView;
}>) {
  const [cityId, setCityId] = useState(venue.cityId);
  const [changingAddress, setChangingAddress] = useState(false);
  const [address, setAddress] = useState<AddressSuggestion | null>(null);
  const [attendanceMode, setAttendanceMode] = useState(venue.defaultAttendanceMode);
  const [state, setState] = useState<VenueWorkspaceMutationState>(null);
  const [pending, startTransition] = useTransition();
  const city = cities.find((candidate) => candidate.id === cityId) ?? null;
  const cityChanged = cityId !== venue.cityId;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateVenueSettingsAction({
        venueId: venue.id,
        name: formData.get("name"),
        slug: formData.get("slug"),
        cityId: formData.get("cityId"),
        description: formData.get("description"),
        facilities: formData.getAll("facilities"),
        houseInformation: formData.get("houseInformation"),
        defaultAttendanceMode: attendanceMode,
        defaultRequiresApproval:
          attendanceMode === "reservations" && formData.get("defaultRequiresApproval") === "on",
        address,
      });
      setState(result);
    });
  }

  return (
    <form className="space-y-7" noValidate onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="venue-settings-name">Venue name</Label>
          <Input
            defaultValue={venue.name}
            id="venue-settings-name"
            maxLength={120}
            name="name"
            required
          />
        </div>
        <div>
          <Label htmlFor="venue-settings-slug">Venue URL</Label>
          <Input
            defaultValue={venue.slug}
            id="venue-settings-slug"
            maxLength={60}
            name="slug"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="venue-settings-city">City</Label>
        <NativeSelect
          id="venue-settings-city"
          name="cityId"
          onChange={(event) => {
            setCityId(event.currentTarget.value);
            setAddress(null);
            if (event.currentTarget.value !== venue.cityId) setChangingAddress(true);
          }}
          required
          value={cityId}
        >
          {cities.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <section
        className="rounded-[1.375rem] border border-border p-5"
        aria-labelledby="current-venue-address"
      >
        <h2 className="font-semibold" id="current-venue-address">
          Public address
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{address?.label ?? venue.addressText}</p>
        {changingAddress ? (
          city === null ? (
            <p className="mt-4 text-sm text-sand">
              Choose a supported city before replacing the address.
            </p>
          ) : (
            <div className="mt-5">
              <AddressSearch city={city.name} locationKind="venue" onConfirm={setAddress} />
            </div>
          )
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
          maxLength={2000}
          minLength={10}
          name="description"
          required
        />
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
                value={value}
              />
              <Label className="cursor-pointer" htmlFor={`venue-settings-${value}`}>
                {label}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="venue-settings-house-information">House information</Label>
        <Textarea
          defaultValue={venue.houseInformation}
          id="venue-settings-house-information"
          maxLength={1000}
          name="houseInformation"
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

      {attendanceMode === "reservations" ? (
        <div className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4">
          <Checkbox
            defaultChecked={venue.defaultRequiresApproval}
            id="venue-settings-default-approval"
            name="defaultRequiresApproval"
          />
          <Label className="cursor-pointer leading-6" htmlFor="venue-settings-default-approval">
            Review attendance requests by default for newly planned events.
          </Label>
        </div>
      ) : null}

      {cityChanged && address === null ? (
        <p className="text-sm text-sand" role="alert">
          Confirm a public address in the newly selected city before saving.
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

      <Button disabled={pending || (cityChanged && address === null)} size="lg" type="submit">
        {pending ? "Saving venue…" : "Save venue"}
      </Button>
    </form>
  );
}
