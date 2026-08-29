"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { saveVenueEventAction } from "@/features/events/actions";
import type { VenueEventCatalog } from "@/features/events/catalog";
import type { VenueEventFormValues } from "@/features/events/state";
import { INITIAL_VENUE_EVENT_MUTATION_STATE } from "@/features/events/state";
import { formatIsraelKickoff } from "@/features/sports/time";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";

type VenueEventFormProps = Readonly<{
  catalog: VenueEventCatalog;
  initialMatchId?: string;
  venue: Readonly<{
    id: string;
    slug: string;
    name: string;
    addressText: string;
    statedCapacity: number | null;
    verificationStatus: "unverified" | "verified";
  }>;
}>;

function emptyValues(
  venue: VenueEventFormProps["venue"],
  initialMatchId: string,
): VenueEventFormValues {
  return {
    eventId: "",
    venueId: venue.id,
    venueSlug: venue.slug,
    matchId: initialMatchId,
    title: "",
    description: "",
    expectedActivity: "Watch the full match together",
    costDescription: "No cover charge",
    eventRules: "Respect venue staff, other supporters, and every attendee.",
    commercialAffiliation: `Hosted commercially by ${venue.name}`,
    hostPresenceConfirmed: false,
    audience: "public",
    audienceTeamId: "",
    capacity: String(venue.statedCapacity ?? 80),
    requiresApproval: false,
  };
}

export function VenueEventForm({ catalog, venue, initialMatchId = "" }: VenueEventFormProps) {
  const [state, formAction, pending] = useActionState(
    saveVenueEventAction,
    INITIAL_VENUE_EVENT_MUTATION_STATE,
  );
  const values = state?.ok === false ? state.values : emptyValues(venue, initialMatchId);
  const [audience, setAudience] = useState<"public" | "team_followers">(
    values.audience === "team_followers" ? "team_followers" : "public",
  );

  if (state?.ok === true) {
    return (
      <Card className="border-court/30 bg-court/10">
        <CardHeader>
          <Badge className="w-fit" variant="outline">
            {state.data.event.status}
          </Badge>
          <CardTitle className="mt-3 text-2xl text-linen">
            <h2>{state.data.message}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/events/${state.data.event.id}`}>Open event</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/venues/${venue.slug}`}>Open venue listings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  return (
    <form
      action={formAction}
      className="space-y-8"
      key={state?.ok === false ? `venue-event-error-${state.attempt}` : "new-venue-event"}
      noValidate
    >
      <input name="eventId" type="hidden" value={values.eventId} />
      <input name="venueId" type="hidden" value={venue.id} />
      <input name="venueSlug" type="hidden" value={venue.slug} />

      <FormSection
        description="The event always uses this owned venue profile and its public location. The form accepts no host ID, address, or coordinate override."
        title="Venue host"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border-dark bg-surface-deep p-5">
          <div>
            <p className="text-lg font-semibold text-linen">{venue.name}</p>
            <p className="mt-2 text-sm text-muted-dark">{venue.addressText}</p>
          </div>
          <VenueVerificationBadge status={venue.verificationStatus} />
        </div>
      </FormSection>

      <FormSection
        description="Kickoff and the three-hour listing window are derived from the synchronized local sports catalog."
        title="Fixture and listing"
      >
        <Field id="venue-event-match" label="Future fixture" messages={fieldErrors?.matchId}>
          <NativeSelect
            defaultValue={values.matchId}
            id="venue-event-match"
            name="matchId"
            required
          >
            <NativeSelectOption value="">Choose a synchronized match</NativeSelectOption>
            {catalog.matches.map((match) => (
              <NativeSelectOption key={match.id} value={match.id}>
                {match.label} — {formatIsraelKickoff(match.startsAt)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="venue-event-title" label="Event title" messages={fieldErrors?.title}>
            <Input
              defaultValue={values.title}
              id="venue-event-title"
              maxLength={120}
              name="title"
              required
            />
          </Field>
          <Field id="venue-event-cost" label="Cost" messages={fieldErrors?.costDescription}>
            <Input
              defaultValue={values.costDescription}
              id="venue-event-cost"
              maxLength={300}
              name="costDescription"
              required
            />
          </Field>
        </div>
        <Field id="venue-event-description" label="Description" messages={fieldErrors?.description}>
          <Textarea
            className="min-h-32"
            defaultValue={values.description}
            id="venue-event-description"
            maxLength={2000}
            name="description"
            required
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="venue-event-activity"
            label="Expected activity"
            messages={fieldErrors?.expectedActivity}
          >
            <Textarea
              defaultValue={values.expectedActivity}
              id="venue-event-activity"
              maxLength={500}
              name="expectedActivity"
              required
            />
          </Field>
          <Field id="venue-event-rules" label="Event rules" messages={fieldErrors?.eventRules}>
            <Textarea
              defaultValue={values.eventRules}
              id="venue-event-rules"
              maxLength={1000}
              name="eventRules"
              required
            />
          </Field>
        </div>
        <Field
          id="venue-event-affiliation"
          label="Commercial affiliation"
          messages={fieldErrors?.commercialAffiliation}
        >
          <Input
            defaultValue={values.commercialAffiliation}
            id="venue-event-affiliation"
            maxLength={300}
            name="commercialAffiliation"
            required
          />
          <span className="mt-2 block text-xs leading-5 text-muted-dark">
            State the relationship plainly. Huddle does not imply verification or sponsorship.
          </span>
        </Field>
      </FormSection>

      <FormSection
        description="Venue summaries are public in both modes. Team follows affect later attendance eligibility, not whether the safe listing may be read."
        title="Audience"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            checked={audience === "public"}
            description="Any eligible completed account may later attend or request."
            label="Public"
            onChange={() => setAudience("public")}
            value="public"
          />
          <Choice
            checked={audience === "team_followers"}
            description="Attendance later requires following the selected team unless directly invited."
            label="Team followers"
            onChange={() => setAudience("team_followers")}
            value="team_followers"
          />
        </div>
        {audience === "team_followers" ? (
          <Field id="venue-event-team" label="Follower team" messages={fieldErrors?.audienceTeamId}>
            <NativeSelect
              defaultValue={values.audienceTeamId}
              id="venue-event-team"
              name="audienceTeamId"
              required
            >
              <NativeSelectOption value="">Choose a team</NativeSelectOption>
              {catalog.teams.map((team) => (
                <NativeSelectOption key={team.id} value={team.id}>
                  {team.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </FormSection>

      <FormSection
        description="Immediate approval is the venue default. Turn review on only when staff need to approve each registered account."
        title="Capacity and approval"
      >
        <Field
          id="venue-event-capacity"
          label="Registered-account capacity"
          messages={fieldErrors?.capacity}
        >
          <Input
            defaultValue={values.capacity}
            id="venue-event-capacity"
            max={100_000}
            min={1}
            name="capacity"
            required
            type="number"
          />
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-border-dark bg-surface-deep p-4 text-sm leading-6 text-muted-dark">
          <Checkbox defaultChecked={values.requiresApproval} name="requiresApproval" />
          <span>Require staff approval for each attendance request.</span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-border-dark bg-surface-deep p-4 text-sm leading-6 text-muted-dark">
          <Checkbox
            defaultChecked={values.hostPresenceConfirmed}
            name="hostPresenceConfirmed"
            required
          />
          <span>
            I confirm that venue staff will host this listing and that every attendee uses one
            registered Huddle account.
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
          {pending ? "Saving…" : "Publish venue event"}
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
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <fieldset className="space-y-5 rounded-[1.75rem] border border-border-dark bg-surface-raised p-6 sm:p-8">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-linen">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-dark">{description}</p>
      </div>
      {children}
    </fieldset>
  );
}

function Choice({
  checked,
  label,
  description,
  value,
  onChange,
}: Readonly<{
  checked: boolean;
  label: string;
  description: string;
  value: "public" | "team_followers";
  onChange: () => void;
}>) {
  return (
    <label className="rounded-xl border border-border-dark bg-surface-deep p-4 has-[:checked]:border-court has-[:checked]:bg-court/10">
      <span className="flex items-center gap-2 font-semibold text-linen">
        <input checked={checked} name="audience" onChange={onChange} type="radio" value={value} />
        {label}
      </span>
      <span className="mt-2 block text-xs leading-5 text-muted-dark">{description}</span>
    </label>
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
        <span className="mt-2 block text-sm text-sand" id={`${id}-error`}>
          {messages[0]}
        </span>
      )}
    </div>
  );
}
