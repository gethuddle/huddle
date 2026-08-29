"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createVenueAction, updateVenueAction } from "@/features/venues/actions";
import type { VenueCatalog } from "@/features/venues/catalog";
import type { VenueFormValues } from "@/features/venues/state";
import { INITIAL_VENUE_MUTATION_STATE } from "@/features/venues/state";

type VenueFormProps = Readonly<{
  mode: "create" | "update";
  catalog: VenueCatalog;
  initialValues?: VenueFormValues;
}>;

const EMPTY_VALUES: VenueFormValues = {
  venueId: "",
  name: "",
  slug: "",
  cityId: "",
  addressText: "",
  longitude: "",
  latitude: "",
  description: "",
  screenCount: "",
  statedCapacity: "",
};

export function VenueForm({ mode, catalog, initialValues = EMPTY_VALUES }: VenueFormProps) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createVenueAction : updateVenueAction,
    INITIAL_VENUE_MUTATION_STATE,
  );

  if (state?.ok === true) {
    return (
      <Card className="border-court/30 bg-court/10">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">Saved</p>
          <CardTitle className="mt-2 text-2xl text-linen">
            <h2>{mode === "create" ? "Your venue profile is live." : "Venue updated."}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-7 text-muted-dark">{state.data.message}</p>
          <p className="mt-3 text-sm font-semibold text-sand">
            Unverified remains visible until a platform moderator changes the status.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/venues/${state.data.venue.slug}`}>Open venue</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/venues/${state.data.venue.slug}/manage`}>Manage venue</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const values = state?.ok === false ? state.values : initialValues;
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  return (
    <form
      action={formAction}
      className="space-y-7"
      key={state?.ok === false ? `error-${state.attempt}` : `${mode}-${values.venueId}`}
      noValidate
    >
      <input name="venueId" type="hidden" value={values.venueId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="venue-name" label="Venue name" messages={fieldErrors?.name}>
          <Input
            aria-describedby="venue-name-error"
            aria-invalid={fieldErrors?.name === undefined ? undefined : true}
            defaultValue={values.name}
            id="venue-name"
            maxLength={120}
            name="name"
            placeholder="The Match Corner"
            required
          />
        </Field>
        <Field id="venue-slug" label="Venue URL" messages={fieldErrors?.slug}>
          <Input
            aria-describedby="venue-slug-help venue-slug-error"
            aria-invalid={fieldErrors?.slug === undefined ? undefined : true}
            defaultValue={values.slug}
            id="venue-slug"
            maxLength={60}
            name="slug"
            placeholder="the-match-corner"
            required
          />
          <span className="mt-2 block text-xs text-muted-dark" id="venue-slug-help">
            Lowercase words separated by hyphens.
          </span>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="venue-city" label="City" messages={fieldErrors?.cityId}>
          <NativeSelect
            aria-describedby="venue-city-error"
            aria-invalid={fieldErrors?.cityId === undefined ? undefined : true}
            defaultValue={values.cityId}
            id="venue-city"
            name="cityId"
            required
          >
            <NativeSelectOption value="">Choose a city</NativeSelectOption>
            {catalog.cities.map((city) => (
              <NativeSelectOption key={city.id} value={city.id}>
                {city.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field id="venue-address" label="Public address" messages={fieldErrors?.addressText}>
          <Input
            aria-describedby="venue-address-error"
            aria-invalid={fieldErrors?.addressText === undefined ? undefined : true}
            defaultValue={values.addressText}
            id="venue-address"
            maxLength={300}
            name="addressText"
            placeholder="12 Hanassi Boulevard, Haifa"
            required
          />
        </Field>
      </div>

      <fieldset>
        <legend className="font-semibold text-linen">Public map coordinate</legend>
        <p className="mt-1 text-sm leading-6 text-muted-dark">
          Enter the venue coordinate manually. Huddle does not add a paid map or address service in
          this milestone.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field id="venue-latitude" label="Latitude" messages={fieldErrors?.latitude}>
            <Input
              aria-describedby="venue-latitude-error"
              aria-invalid={fieldErrors?.latitude === undefined ? undefined : true}
              defaultValue={values.latitude}
              id="venue-latitude"
              max="34"
              min="29"
              name="latitude"
              placeholder="32.81303"
              required
              step="0.00001"
              type="number"
            />
          </Field>
          <Field id="venue-longitude" label="Longitude" messages={fieldErrors?.longitude}>
            <Input
              aria-describedby="venue-longitude-error"
              aria-invalid={fieldErrors?.longitude === undefined ? undefined : true}
              defaultValue={values.longitude}
              id="venue-longitude"
              max="36"
              min="34"
              name="longitude"
              placeholder="34.99928"
              required
              step="0.00001"
              type="number"
            />
          </Field>
        </div>
      </fieldset>

      <Field id="venue-description" label="Description" messages={fieldErrors?.description}>
        <Textarea
          aria-describedby="venue-description-error"
          aria-invalid={fieldErrors?.description === undefined ? undefined : true}
          className="min-h-32 resize-y"
          defaultValue={values.description}
          id="venue-description"
          maxLength={2000}
          name="description"
          placeholder="What supporters can expect, accessibility details, and the atmosphere."
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="venue-screens"
          label="Screen count (optional)"
          messages={fieldErrors?.screenCount}
        >
          <Input
            aria-describedby="venue-screens-error"
            aria-invalid={fieldErrors?.screenCount === undefined ? undefined : true}
            defaultValue={values.screenCount}
            id="venue-screens"
            max="1000"
            min="1"
            name="screenCount"
            type="number"
          />
        </Field>
        <Field
          id="venue-capacity"
          label="Stated capacity (optional)"
          messages={fieldErrors?.statedCapacity}
        >
          <Input
            aria-describedby="venue-capacity-error"
            aria-invalid={fieldErrors?.statedCapacity === undefined ? undefined : true}
            defaultValue={values.statedCapacity}
            id="venue-capacity"
            max="100000"
            min="1"
            name="statedCapacity"
            type="number"
          />
        </Field>
      </div>

      {state === null ? null : (
        <Alert role="alert" variant="destructive">
          <AlertDescription className="text-sand">{state.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-sand/40 bg-sand/10 p-4 text-sm leading-6 text-sand">
        Every user-created venue is labelled <strong>unverified</strong>. This does not prove
        ownership, licensing, safety, or accessibility.
      </div>

      <Button disabled={pending} size="lg" type="submit">
        {pending ? "Saving…" : mode === "create" ? "Create unverified venue" : "Save venue"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  messages,
  children,
}: Readonly<{
  id: string;
  label: string;
  messages?: string[];
  children: ReactNode;
}>) {
  return (
    <div>
      <Label className="text-linen" htmlFor={id}>
        {label}
      </Label>
      <div className="mt-2">{children}</div>
      {messages === undefined || messages.length === 0 ? null : (
        <span className="mt-2 block text-sm text-sand" id={`${id}-error`}>
          {messages[0]}
        </span>
      )}
    </div>
  );
}
