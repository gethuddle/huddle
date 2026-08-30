"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { PrivateEventCatalog } from "@/features/events/catalog";
import type { EventDraftPatch, EventDraftProtectedLocation } from "@/features/events/schemas";
import { AddressSearch } from "@/features/locations/components/address-search";
import { MapPinPicker } from "@/features/locations/components/map-pin-picker";
import type { AddressSuggestion, PrivateLocationSelection } from "@/features/locations/types";

type EventPlaceStepProps = Readonly<{
  catalog: PrivateEventCatalog;
  organizingGroupId: string | null;
  protectedLocation: EventDraftProtectedLocation | null;
  values: EventDraftPatch;
  onOrganizingGroupChange: (groupId: string | null) => void;
  onProtectedLocationChange: (location: EventDraftProtectedLocation | null) => void;
  onValuesChange: (patch: EventDraftPatch) => void;
  onFindFirstFriend: () => void;
  saving: boolean;
}>;

export function EventPlaceStep({
  catalog,
  onOrganizingGroupChange,
  onFindFirstFriend,
  onProtectedLocationChange,
  onValuesChange,
  organizingGroupId,
  protectedLocation,
  saving,
  values,
}: EventPlaceStepProps) {
  const [replacePrivateLocation, setReplacePrivateLocation] = useState(protectedLocation === null);
  const city = catalog.cities.find((candidate) => candidate.id === values.cityId) ?? null;
  const placeKind = values.placeKind ?? "home";
  const audience = values.audience ?? "invite_only";

  function updatePublicAddress(suggestion: AddressSuggestion | null) {
    onValuesChange(
      suggestion === null
        ? {
            publicAddressText: null,
            publicLatitude: null,
            publicLongitude: null,
          }
        : {
            publicAddressText: suggestion.label,
            publicLatitude: suggestion.latitude,
            publicLongitude: suggestion.longitude,
          },
    );
  }

  function updatePrivateLocation(selection: PrivateLocationSelection) {
    onProtectedLocationChange(
      selection.point === null || selection.addressText.trim().length < 5
        ? null
        : {
            addressText: selection.addressText,
            directionsText: null,
            latitude: selection.point.latitude,
            longitude: selection.point.longitude,
          },
    );
  }

  function changeCity(cityId: string) {
    onValuesChange({
      cityId,
      publicPlaceName: null,
      publicAddressText: null,
      publicLatitude: null,
      publicLongitude: null,
    });
    onProtectedLocationChange(null);
    setReplacePrivateLocation(true);
  }

  function changePlaceKind(nextPlaceKind: "home" | "public_place") {
    if (nextPlaceKind === placeKind) return;
    onProtectedLocationChange(null);
    setReplacePrivateLocation(true);
    onValuesChange({
      placeKind: nextPlaceKind,
      publicPlaceName: null,
      publicAddressText: null,
      publicLatitude: null,
      publicLongitude: null,
    });
  }

  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="event-title" label="Event title">
          <Input
            id="event-title"
            maxLength={120}
            onChange={(event) => onValuesChange({ title: event.currentTarget.value })}
            required
            value={values.title ?? ""}
          />
        </Field>
        <Field id="event-city" label="City">
          <NativeSelect
            id="event-city"
            onChange={(event) => changeCity(event.currentTarget.value)}
            required
            value={values.cityId ?? ""}
          >
            <NativeSelectOption value="">Choose a city</NativeSelectOption>
            {catalog.cities.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field id="event-description" label="Description">
        <Textarea
          className="min-h-28"
          id="event-description"
          maxLength={2000}
          onChange={(event) => onValuesChange({ description: event.currentTarget.value })}
          required
          value={values.description ?? ""}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-foreground">Place</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            checked={placeKind === "home"}
            description="Exact details stay protected until attendance is approved."
            label="My home"
            name="place-kind"
            onChange={() => changePlaceKind("home")}
            value="home"
          />
          <Choice
            checked={placeKind === "public_place"}
            description="A confirmed public address is visible to the eligible audience."
            label="Public place"
            name="place-kind"
            onChange={() => changePlaceKind("public_place")}
            value="public_place"
          />
        </div>
      </fieldset>

      {city === null ? (
        <p
          className="rounded-2xl border border-sand/40 bg-sand/10 p-4 text-sm text-sand"
          role="status"
        >
          Choose a city before setting the location.
        </p>
      ) : placeKind === "home" ? (
        <div className="space-y-4 rounded-[1.375rem] border border-border bg-secondary p-5">
          {protectedLocation !== null && !replacePrivateLocation ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                A protected home address and pin are saved for this draft.
              </p>
              <Button
                onClick={() => setReplacePrivateLocation(true)}
                type="button"
                variant="outline"
              >
                Replace protected location
              </Button>
            </div>
          ) : (
            <MapPinPicker citySlug={city.slug} onChange={updatePrivateLocation} />
          )}
        </div>
      ) : (
        <div className="space-y-5 rounded-[1.375rem] border border-border bg-secondary p-5">
          <Field id="event-public-place" label="Place name">
            <Input
              id="event-public-place"
              maxLength={120}
              onChange={(event) => onValuesChange({ publicPlaceName: event.currentTarget.value })}
              required
              value={values.publicPlaceName ?? ""}
            />
          </Field>
          {values.publicAddressText == null ? null : (
            <p className="text-sm text-muted-foreground">
              Saved address:{" "}
              <span className="font-semibold text-foreground">{values.publicAddressText}</span>
            </p>
          )}
          <AddressSearch
            city={city.name}
            locationKind="public_place"
            onConfirm={updatePublicAddress}
          />
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="font-semibold text-foreground">Audience</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Choice
            checked={audience === "invite_only"}
            description="Only people you invite directly."
            label="Invite only"
            name="audience"
            onChange={() => onValuesChange({ audience: "invite_only", audienceGroupId: null })}
            value="invite_only"
          />
          <Choice
            checked={audience === "friends"}
            description={
              catalog.acceptedFriendCount > 0
                ? "Accepted direct friends."
                : "Add a first friend before choosing this audience."
            }
            disabled={catalog.acceptedFriendCount === 0}
            label="Friends"
            name="audience"
            onChange={() => onValuesChange({ audience: "friends", audienceGroupId: null })}
            value="friends"
          />
          <Choice
            checked={audience === "group"}
            description="Active members of one supporter group."
            disabled={catalog.groups.length === 0}
            label="Supporter group"
            name="audience"
            onChange={() => onValuesChange({ audience: "group" })}
            value="group"
          />
        </div>
        {catalog.acceptedFriendCount === 0 ? (
          <Button disabled={saving} onClick={onFindFirstFriend} type="button" variant="outline">
            {saving ? "Saving…" : "Find your first friend"}
          </Button>
        ) : null}
      </fieldset>

      {audience === "group" ? (
        <Field id="event-audience-group" label="Audience group">
          <NativeSelect
            id="event-audience-group"
            onChange={(event) =>
              onValuesChange({ audienceGroupId: event.currentTarget.value || null })
            }
            required
            value={values.audienceGroupId ?? ""}
          >
            <NativeSelectOption value="">Choose a group</NativeSelectOption>
            {catalog.groups.map((group) => (
              <NativeSelectOption key={group.id} value={group.id}>
                {group.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      <Field id="event-organizer" label="Organizing group (optional)">
        <NativeSelect
          id="event-organizer"
          onChange={(event) => onOrganizingGroupChange(event.currentTarget.value || null)}
          value={organizingGroupId ?? ""}
        >
          <NativeSelectOption value="">No organizing group</NativeSelectOption>
          {catalog.groups.map((group) => (
            <NativeSelectOption key={group.id} value={group.id}>
              {group.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="event-capacity" label="Maximum people">
          <Input
            id="event-capacity"
            max={placeKind === "home" ? 12 : 1000}
            min={1}
            onChange={(event) =>
              onValuesChange({ capacity: Number.parseInt(event.currentTarget.value, 10) || 0 })
            }
            required
            type="number"
            value={values.capacity ?? 6}
          />
        </Field>
        <label className="flex min-h-12 items-start gap-3 rounded-xl border border-border bg-secondary p-4 text-sm leading-6 text-muted-foreground">
          <input
            checked={values.hostPresenceConfirmed ?? false}
            className="mt-1 size-5 accent-[var(--color-court)]"
            onChange={(event) =>
              onValuesChange({ hostPresenceConfirmed: event.currentTarget.checked })
            }
            type="checkbox"
          />
          <span>I will be present, and each attendee will use their own Huddle account.</span>
        </label>
      </div>

      {placeKind === "home" ? (
        <p className="text-sm font-semibold text-sand">
          Home events can have at most 12 registered attendees, including the host.
        </p>
      ) : null}

      <details className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer font-semibold text-foreground">
          Optional event details
        </summary>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="event-activity" label="What will happen">
            <Textarea
              id="event-activity"
              onChange={(event) => onValuesChange({ expectedActivity: event.currentTarget.value })}
              value={values.expectedActivity ?? ""}
            />
          </Field>
          <Field id="event-cost" label="Cost">
            <Input
              id="event-cost"
              onChange={(event) => onValuesChange({ costDescription: event.currentTarget.value })}
              value={values.costDescription ?? ""}
            />
          </Field>
          <Field id="event-rules" label="Event rules">
            <Textarea
              id="event-rules"
              onChange={(event) => onValuesChange({ eventRules: event.currentTarget.value })}
              value={values.eventRules ?? ""}
            />
          </Field>
          <Field id="event-affiliation" label="Business connection">
            <Input
              id="event-affiliation"
              onChange={(event) =>
                onValuesChange({ commercialAffiliation: event.currentTarget.value })
              }
              value={values.commercialAffiliation ?? ""}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}

function Field({
  children,
  id,
  label,
}: Readonly<{ children: React.ReactNode; id: string; label: string }>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Choice({
  checked,
  description,
  disabled = false,
  label,
  name,
  onChange,
  value,
}: Readonly<{
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}>) {
  return (
    <label className="min-h-24 rounded-xl border border-border bg-secondary p-4 has-[:checked]:border-primary has-[:disabled]:opacity-50">
      <span className="flex items-center gap-2 font-semibold text-foreground">
        <input
          checked={checked}
          disabled={disabled}
          name={name}
          onChange={onChange}
          type="radio"
          value={value}
        />
        {label}
      </span>
      <span className="mt-2 block text-xs leading-5 text-muted-foreground">{description}</span>
    </label>
  );
}
