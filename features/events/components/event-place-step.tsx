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
  fieldErrors?: Readonly<Record<string, string>>;
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
  fieldErrors = {},
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
        <Field error={fieldErrors["event-title"]} id="event-title" label="Event title">
          <Input
            aria-describedby={fieldErrors["event-title"] ? "event-title-error" : undefined}
            aria-invalid={fieldErrors["event-title"] ? true : undefined}
            id="event-title"
            maxLength={120}
            onChange={(event) => onValuesChange({ title: event.currentTarget.value })}
            required
            value={values.title ?? ""}
          />
        </Field>
        <Field error={fieldErrors["event-city"]} id="event-city" label="City">
          <NativeSelect
            aria-describedby={fieldErrors["event-city"] ? "event-city-error" : undefined}
            aria-invalid={fieldErrors["event-city"] ? true : undefined}
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

      <Field error={fieldErrors["event-description"]} id="event-description" label="Description">
        <Textarea
          aria-describedby={
            fieldErrors["event-description"] ? "event-description-error" : undefined
          }
          aria-invalid={fieldErrors["event-description"] ? true : undefined}
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
        <div
          className="space-y-4 rounded-[1.375rem] border border-border bg-secondary p-5"
          id="event-private-location"
          tabIndex={-1}
        >
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
          {fieldErrors["event-private-location"] ? (
            <p className="text-sm text-destructive" id="event-private-location-error">
              {fieldErrors["event-private-location"]}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5 rounded-[1.375rem] border border-border bg-secondary p-5">
          <Field
            error={fieldErrors["event-public-place"]}
            id="event-public-place"
            label="Place name"
          >
            <Input
              aria-describedby={
                fieldErrors["event-public-place"] ? "event-public-place-error" : undefined
              }
              aria-invalid={fieldErrors["event-public-place"] ? true : undefined}
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
          <div id="event-public-address" tabIndex={-1}>
            <AddressSearch
              city={city.name}
              locationKind="public_place"
              onConfirm={updatePublicAddress}
            />
            {fieldErrors["event-public-address"] ? (
              <p className="mt-2 text-sm text-destructive">{fieldErrors["event-public-address"]}</p>
            ) : null}
          </div>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="font-semibold text-foreground">Audience</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Choice
            checked={audience === "invite_only"}
            description="Only people you invite by name or secure link. It stays out of Explore."
            label="Invite only"
            name="audience"
            onChange={() => onValuesChange({ audience: "invite_only", audienceGroupId: null })}
            value="invite_only"
          />
          <Choice
            checked={audience === "friends"}
            description={
              catalog.acceptedFriendCount > 0
                ? "Appears in Explore only to your accepted friends."
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
            description="Appears in Explore only to active members of one group."
            disabled={catalog.groups.length === 0}
            label="Group"
            name="audience"
            onChange={() => {
              onValuesChange({ audience: "group" });
              onOrganizingGroupChange(values.audienceGroupId ?? null);
            }}
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
        <Field
          error={fieldErrors["event-audience-group"]}
          id="event-audience-group"
          label="Audience group"
        >
          <NativeSelect
            aria-describedby={
              fieldErrors["event-audience-group"] ? "event-audience-group-error" : undefined
            }
            aria-invalid={fieldErrors["event-audience-group"] ? true : undefined}
            id="event-audience-group"
            onChange={(event) => {
              const groupId = event.currentTarget.value || null;
              onValuesChange({ audienceGroupId: groupId });
              onOrganizingGroupChange(groupId);
            }}
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

      {audience === "group" || catalog.groups.length === 0 ? null : (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-semibold text-foreground">
            Submit through a group (optional)
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use this only when the event should belong to one of your groups. Another owner or admin
            reviews it before it is published.
          </p>
          <div className="mt-4">
            <Field id="event-organizer" label="Group">
              <NativeSelect
                id="event-organizer"
                onChange={(event) => onOrganizingGroupChange(event.currentTarget.value || null)}
                value={organizingGroupId ?? ""}
              >
                <NativeSelectOption value="">Not a group event</NativeSelectOption>
                {catalog.groups.map((group) => (
                  <NativeSelectOption key={group.id} value={group.id}>
                    {group.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </details>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={fieldErrors["event-capacity"]} id="event-capacity" label="Maximum people">
          <Input
            aria-describedby={fieldErrors["event-capacity"] ? "event-capacity-error" : undefined}
            aria-invalid={fieldErrors["event-capacity"] ? true : undefined}
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
            aria-describedby={
              fieldErrors["event-host-presence"] ? "event-host-presence-error" : undefined
            }
            aria-invalid={fieldErrors["event-host-presence"] ? true : undefined}
            checked={values.hostPresenceConfirmed ?? false}
            className="mt-1 size-5 accent-[var(--color-court)]"
            id="event-host-presence"
            onChange={(event) =>
              onValuesChange({ hostPresenceConfirmed: event.currentTarget.checked })
            }
            type="checkbox"
          />
          <span>
            I will be present, and each attendee will use their own Huddle account.
            {fieldErrors["event-host-presence"] ? (
              <span className="mt-1 block text-destructive" id="event-host-presence-error">
                {fieldErrors["event-host-presence"]}
              </span>
            ) : null}
          </span>
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
  error,
  id,
  label,
}: Readonly<{ children: React.ReactNode; error?: string; id: string; label: string }>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-2 text-sm text-destructive" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
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
