"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { savePrivateEventAction } from "@/features/events/actions";
import type { PrivateEventCatalog } from "@/features/events/catalog";
import type { PrivateEventFormValues } from "@/features/events/state";
import { INITIAL_PRIVATE_EVENT_MUTATION_STATE } from "@/features/events/state";
import { formatIsraelKickoff } from "@/features/sports/time";

type PrivateEventFormProps = Readonly<{
  catalog: PrivateEventCatalog;
  initialMatchId?: string;
}>;

function emptyValues(initialMatchId: string): PrivateEventFormValues {
  return {
    eventId: "",
    organizingGroupId: "",
    matchId: initialMatchId,
    title: "",
    description: "",
    expectedActivity: "Watch the full match together",
    costDescription: "Free",
    eventRules: "Respect the host, the home, and every attendee.",
    commercialAffiliation: "None",
    hostPresenceConfirmed: false,
    cityId: "",
    placeKind: "home",
    publicPlaceName: "",
    publicAddressText: "",
    publicLongitude: "",
    publicLatitude: "",
    privateAddressText: "",
    privateDirections: "",
    privateLongitude: "",
    privateLatitude: "",
    audience: "invite_only",
    audienceGroupId: "",
    capacity: "6",
  };
}

export function PrivateEventForm({ catalog, initialMatchId = "" }: PrivateEventFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    savePrivateEventAction,
    INITIAL_PRIVATE_EVENT_MUTATION_STATE,
  );
  const values = state?.ok === false ? state.values : emptyValues(initialMatchId);
  const [placeKind, setPlaceKind] = useState<"home" | "public_place">(
    values.placeKind === "public_place" ? "public_place" : "home",
  );
  const [audience, setAudience] = useState<"group" | "friends" | "invite_only">(
    values.audience === "group" || values.audience === "friends" ? values.audience : "invite_only",
  );
  const [organizingGroupId, setOrganizingGroupId] = useState(values.organizingGroupId);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const hasOptionalDetailErrors =
    state?.ok === false &&
    (state.error.fields?.expectedActivity !== undefined ||
      state.error.fields?.costDescription !== undefined ||
      state.error.fields?.eventRules !== undefined ||
      state.error.fields?.commercialAffiliation !== undefined);

  useEffect(() => {
    if (state?.ok === true) {
      router.replace(`/events/${state.data.event.id}?created=1`);
    }
  }, [router, state]);

  if (state?.ok === true) {
    return (
      <Card className="border-court/30 bg-court/10">
        <CardHeader>
          <Badge className="w-fit" variant="outline">
            {state.data.event.status.replaceAll("_", " ")}
          </Badge>
          <CardTitle className="mt-3 text-2xl text-linen">
            <h2>{state.data.message}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-7 text-muted-dark">
            Opening the event now. It will also stay in My Huddle so you can always find and manage
            it later.
          </p>
          <Button asChild className="mt-6">
            <Link href={"/events/" + state.data.event.id}>Open event</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  return (
    <form
      action={formAction}
      className="space-y-10"
      key={state?.ok === false ? "event-error-" + state.attempt : "new-private-event"}
      noValidate
    >
      <input name="eventId" type="hidden" value={values.eventId} />

      <FormSection
        description="Choose the match you are gathering for. Huddle sets the kickoff and event time automatically."
        number="01"
        title="Choose the fixture"
      >
        <Field id="event-match" label="Future fixture" messages={fieldErrors?.matchId}>
          <NativeSelect defaultValue={values.matchId} id="event-match" name="matchId" required>
            <NativeSelectOption value="">Choose a fixture</NativeSelectOption>
            {catalog.matches.map((match) => (
              <NativeSelectOption key={match.id} value={match.id}>
                {match.label} — {formatIsraelKickoff(match.startsAt)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FormSection>

      <FormSection
        description="Give people a clear reason to join and enough detail to know what to expect."
        number="02"
        title="Describe the huddle"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="event-title" label="Event title" messages={fieldErrors?.title}>
            <Input
              defaultValue={values.title}
              id="event-title"
              maxLength={120}
              name="title"
              required
            />
          </Field>
          <Field id="event-city" label="City" messages={fieldErrors?.cityId}>
            <NativeSelect defaultValue={values.cityId} id="event-city" name="cityId" required>
              <NativeSelectOption value="">Choose a city</NativeSelectOption>
              {catalog.cities.map((city) => (
                <NativeSelectOption key={city.id} value={city.id}>
                  {city.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field id="event-description" label="Description" messages={fieldErrors?.description}>
          <Textarea
            className="min-h-32"
            defaultValue={values.description}
            id="event-description"
            maxLength={2000}
            name="description"
            required
          />
        </Field>
        <details
          className="rounded-xl border border-border-dark bg-surface-deep p-4"
          onToggle={(event) => setMoreDetailsOpen(event.currentTarget.open)}
          open={moreDetailsOpen || hasOptionalDetailErrors}
        >
          <summary className="cursor-pointer font-semibold text-linen">More event details</summary>
          <p className="mt-2 text-sm text-muted-dark">
            Huddle has filled in sensible defaults. Open this section only if you want to change the
            activity, cost, rules or business connection.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              id="event-activity"
              label="What will happen"
              messages={fieldErrors?.expectedActivity}
            >
              <Textarea
                defaultValue={values.expectedActivity}
                id="event-activity"
                maxLength={500}
                name="expectedActivity"
                required
              />
            </Field>
            <Field id="event-cost" label="Cost" messages={fieldErrors?.costDescription}>
              <Input
                defaultValue={values.costDescription}
                id="event-cost"
                maxLength={300}
                name="costDescription"
                required
              />
            </Field>
            <Field id="event-rules" label="Event rules" messages={fieldErrors?.eventRules}>
              <Textarea
                defaultValue={values.eventRules}
                id="event-rules"
                maxLength={1000}
                name="eventRules"
                required
              />
            </Field>
            <Field
              id="event-affiliation"
              label="Business connection"
              messages={fieldErrors?.commercialAffiliation}
            >
              <Input
                defaultValue={values.commercialAffiliation}
                id="event-affiliation"
                maxLength={300}
                name="commercialAffiliation"
                required
              />
            </Field>
          </div>
        </details>
      </FormSection>

      <FormSection
        description="Choose where you will watch. Home addresses stay private until attendance is approved."
        number="03"
        title="Set the place"
      >
        <ChoiceGrid>
          <Choice
            checked={placeKind === "home"}
            description="Your exact address and map pin stay hidden until an attendee is approved."
            label="My home"
            name="placeKind"
            onChange={() => setPlaceKind("home")}
            value="home"
          />
          <Choice
            checked={placeKind === "public_place"}
            description="The place name, public address and map pin appear on the event page."
            label="Public place"
            name="placeKind"
            onChange={() => setPlaceKind("public_place")}
            value="public_place"
          />
        </ChoiceGrid>

        {placeKind === "home" ? (
          <div className="space-y-5 rounded-2xl border border-sand/40 bg-sand/10 p-5">
            <p className="text-sm font-semibold text-sand">
              Your exact home address is protected. Only an approved attendee can open it, and
              Huddle records that access.
            </p>
            <Field
              id="event-private-address"
              label="Exact home address"
              messages={fieldErrors?.privateAddressText}
            >
              <Input
                defaultValue={values.privateAddressText}
                id="event-private-address"
                maxLength={300}
                name="privateAddressText"
                required
              />
            </Field>
            <Field
              id="event-private-directions"
              label="Private directions (optional)"
              messages={fieldErrors?.privateDirections}
            >
              <Input
                defaultValue={values.privateDirections}
                id="event-private-directions"
                maxLength={500}
                name="privateDirections"
              />
            </Field>
            <CoordinateFields
              errors={fieldErrors}
              latitude={values.privateLatitude}
              longitude={values.privateLongitude}
              prefix="private"
            />
          </div>
        ) : (
          <div className="space-y-5 rounded-2xl border border-border-dark bg-surface-deep p-5">
            <p className="text-sm text-muted-dark">
              These public-place details are visible to the eligible audience. Do not enter a home
              address here.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="event-public-place"
                label="Place name"
                messages={fieldErrors?.publicPlaceName}
              >
                <Input
                  defaultValue={values.publicPlaceName}
                  id="event-public-place"
                  maxLength={120}
                  name="publicPlaceName"
                  required
                />
              </Field>
              <Field
                id="event-public-address"
                label="Public address"
                messages={fieldErrors?.publicAddressText}
              >
                <Input
                  defaultValue={values.publicAddressText}
                  id="event-public-address"
                  maxLength={300}
                  name="publicAddressText"
                  required
                />
              </Field>
            </div>
            <CoordinateFields
              errors={fieldErrors}
              latitude={values.publicLatitude}
              longitude={values.publicLongitude}
              prefix="public"
            />
          </div>
        )}
      </FormSection>

      <FormSection
        description="Choose the people who are allowed to open and attend this event."
        number="04"
        title="Choose who may see it"
      >
        <ChoiceGrid>
          <Choice
            checked={audience === "invite_only"}
            description="Only people you invite directly can open and join the event."
            label="Invite only"
            name="audience"
            onChange={() => setAudience("invite_only")}
            value="invite_only"
          />
          <Choice
            checked={audience === "friends"}
            description={
              catalog.acceptedFriendCount > 0
                ? "Accepted direct friends only."
                : "Requires at least one accepted direct friend."
            }
            disabled={catalog.acceptedFriendCount === 0}
            label="Friends"
            name="audience"
            onChange={() => setAudience("friends")}
            value="friends"
          />
          <Choice
            checked={audience === "group"}
            description="Active members of one group. A group admin reviews it before publication."
            disabled={catalog.groups.length === 0}
            label="Supporter group"
            name="audience"
            onChange={() => setAudience("group")}
            value="group"
          />
        </ChoiceGrid>
        {audience === "group" ? (
          <Field id="event-group" label="Audience group" messages={fieldErrors?.audienceGroupId}>
            <NativeSelect
              defaultValue={values.audienceGroupId}
              id="event-group"
              name="audienceGroupId"
              required
            >
              <NativeSelectOption value="">Choose an active group</NativeSelectOption>
              {catalog.groups.map((group) => (
                <NativeSelectOption key={group.id} value={group.id}>
                  {group.name} ({group.lifecycle})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : null}

        <Field
          id="event-organizing-group"
          label="Organizing group (optional)"
          messages={fieldErrors?.organizingGroupId}
        >
          <NativeSelect
            id="event-organizing-group"
            name="organizingGroupId"
            onChange={(event) => setOrganizingGroupId(event.target.value)}
            value={organizingGroupId}
          >
            <NativeSelectOption value="">No organizing group</NativeSelectOption>
            {catalog.groups.map((group) => (
              <NativeSelectOption key={group.id} value={group.id}>
                {group.name} ({group.lifecycle})
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="mt-2 block text-xs leading-5 text-muted-dark">
            Use this only when a group is helping organize. Its admins will review the event before
            it appears.
          </span>
        </Field>
      </FormSection>

      <FormSection
        description="Set the maximum number of people and confirm that you will be there."
        number="05"
        title="Confirm safety details"
      >
        <Field id="event-capacity" label="Maximum people" messages={fieldErrors?.capacity}>
          <Input
            defaultValue={values.capacity}
            id="event-capacity"
            max={placeKind === "home" ? 12 : 1000}
            min={1}
            name="capacity"
            required
            type="number"
          />
          {placeKind === "home" ? (
            <span className="mt-2 block text-xs font-semibold text-sand">
              Home events can have at most 12 people, including you. Everyone needs their own Huddle
              account.
            </span>
          ) : null}
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-border-dark bg-surface-deep p-4 text-sm leading-6 text-muted-dark">
          <input
            className="mt-1 size-4 accent-[var(--color-court)]"
            defaultChecked={values.hostPresenceConfirmed}
            name="hostPresenceConfirmed"
            required
            type="checkbox"
          />
          <span>
            I confirm that I am the host, I will be present, and every attendee must use their own
            verified Huddle account.
          </span>
        </label>
        {fieldErrors?.hostPresenceConfirmed?.[0] === undefined ? null : (
          <p className="text-sm text-sand">{fieldErrors.hostPresenceConfirmed[0]}</p>
        )}
      </FormSection>

      {state === null ? null : (
        <Alert role="alert" variant="destructive">
          <AlertDescription className="text-sand">{state.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} name="intent" size="lg" type="submit" value="publish">
          {pending
            ? "Saving…"
            : audience === "group" || organizingGroupId !== ""
              ? "Submit for group review"
              : "Publish event"}
        </Button>
        <Button
          disabled={pending}
          name="intent"
          size="lg"
          type="submit"
          value="draft"
          variant="outline"
        >
          Save draft
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: Readonly<{ number: string; title: string; description: string; children: ReactNode }>) {
  return (
    <fieldset className="space-y-5 rounded-[1.75rem] border border-border-dark bg-surface-raised p-6 sm:p-8">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-court text-sm font-bold text-ink">
          {number}
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-linen">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-dark">{description}</p>
        </div>
      </div>
      {children}
    </fieldset>
  );
}

function ChoiceGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}

function Choice({
  checked,
  label,
  description,
  name,
  value,
  disabled = false,
  onChange,
}: Readonly<{
  checked: boolean;
  label: string;
  description: string;
  name: string;
  value: string;
  disabled?: boolean;
  onChange: () => void;
}>) {
  return (
    <label className="rounded-xl border border-border-dark bg-surface-deep p-4 has-[:checked]:border-court has-[:checked]:bg-court/10 has-[:disabled]:opacity-50">
      <span className="flex items-center gap-2 font-semibold text-linen">
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
      <span className="mt-2 block text-xs leading-5 text-muted-dark">{description}</span>
    </label>
  );
}

function CoordinateFields({
  prefix,
  longitude,
  latitude,
  errors,
}: Readonly<{
  prefix: "private" | "public";
  longitude: string;
  latitude: string;
  errors?: Record<string, string[]>;
}>) {
  const longitudeKey = prefix + "Longitude";
  const latitudeKey = prefix + "Latitude";
  const [longitudeValue, setLongitudeValue] = useState(longitude);
  const [latitudeValue, setLatitudeValue] = useState(latitude);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Location is not available in this browser. Enter the pin manually.");
      return;
    }

    setLocationStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLongitudeValue(position.coords.longitude.toFixed(5));
        setLatitudeValue(position.coords.latitude.toFixed(5));
        setLocationStatus("Location pin added. Check that it matches the event address.");
      },
      () => setLocationStatus("Location was not shared. You can enter the pin manually."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border-dark bg-ink/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-linen">Location pin</p>
          <p className="mt-1 text-xs leading-5 text-muted-dark">
            This makes nearby discovery work. It never publishes a home location.
          </p>
        </div>
        <Button onClick={useCurrentLocation} size="sm" type="button" variant="outline">
          Use my current location
        </Button>
      </div>
      {locationStatus === null ? null : (
        <p aria-live="polite" className="text-sm text-muted-dark">
          {locationStatus}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={prefix + "-longitude"} label="Longitude" messages={errors?.[longitudeKey]}>
          <Input
            id={prefix + "-longitude"}
            max={36}
            min={34}
            name={longitudeKey}
            onChange={(event) => setLongitudeValue(event.target.value)}
            required
            step="0.00001"
            type="number"
            value={longitudeValue}
          />
        </Field>
        <Field id={prefix + "-latitude"} label="Latitude" messages={errors?.[latitudeKey]}>
          <Input
            id={prefix + "-latitude"}
            max={34}
            min={29}
            name={latitudeKey}
            onChange={(event) => setLatitudeValue(event.target.value)}
            required
            step="0.00001"
            type="number"
            value={latitudeValue}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  messages,
  children,
}: Readonly<{ id: string; label: string; messages?: string[]; children: ReactNode }>) {
  return (
    <div>
      <Label className="text-linen" htmlFor={id}>
        {label}
      </Label>
      <div className="mt-2">{children}</div>
      {messages?.[0] === undefined ? null : (
        <span className="mt-2 block text-sm text-sand" id={id + "-error"}>
          {messages[0]}
        </span>
      )}
    </div>
  );
}
