"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { saveVenueEventAction } from "@/features/events/actions";
import type { VenueEventMutationState } from "@/features/events/state";
import type { ManagedVenueEvent } from "@/features/venues/workspace/queries";
import { FieldError, fieldFeedback, FocusInvalidFields } from "./field-feedback";

export function VenueEventEditor({
  event,
  canEdit,
  canPublish,
}: Readonly<{ event: ManagedVenueEvent; canEdit: boolean; canPublish: boolean }>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<VenueEventMutationState>(null);
  const [transportError, setTransportError] = useState(false);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hasStarted] = useState(() => Date.parse(event.starts_at) <= Date.now());
  const errors = state?.ok === false ? state.error.fields : undefined;
  const status = state?.ok === true ? state.data.event.status : event.status;
  const editable = canEdit && (status === "draft" || status === "published");

  function save(intent: "draft" | "publish" | "cancel") {
    if (
      pending ||
      !editable ||
      (intent !== "cancel" && Date.parse(event.starts_at) <= Date.now()) ||
      (intent === "publish" && !canPublish && status === "draft") ||
      formRef.current === null
    )
      return;
    const data = new FormData(formRef.current);
    data.set("intent", intent);
    startTransition(async () => {
      setTransportError(false);
      try {
        const result = await saveVenueEventAction(state, data);
        setState(result);
        if (result?.ok) {
          setConfirmCancellation(false);
          router.refresh();
        }
      } catch {
        setTransportError(true);
      }
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    save(
      submitter instanceof HTMLButtonElement && submitter.value === "publish"
        ? "publish"
        : status === "published"
          ? "publish"
          : "draft",
    );
  }
  const fields = [
    ["title", "Event title", event.title, 120],
    ["description", "Description", event.description, 2000],
    ["expectedActivity", "Expected activity", event.expected_activity, 500],
    ["costDescription", "Cost", event.cost_description, 300],
    ["eventRules", "Event rules", event.event_rules, 1000],
    ["commercialAffiliation", "Commercial affiliation", event.commercial_affiliation, 300],
  ] as const;

  return (
    <FocusInvalidFields errors={errors} pending={pending}>
      <form
        className="mt-8 space-y-5 rounded-2xl border border-border p-5"
        ref={formRef}
        onSubmit={submit}
        noValidate
      >
        <h2 className="text-2xl font-semibold">
          {status === "draft" ? "Edit venue draft" : "Event details"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {event.venue_space_name ?? "Venue"} ·{" "}
          {event.attendance_mode === "open_door"
            ? "Open door — no reservation or guest list"
            : "Reservations"}
          . The fixture, area and audience stay as planned.
        </p>
        <input type="hidden" name="eventId" value={event.event_id} />
        <input type="hidden" name="venueId" value={event.venue_id} />
        <input type="hidden" name="venueSlug" value={event.venue_slug} />
        <fieldset disabled={!editable || pending} className="space-y-5">
          <fieldset disabled={hasStarted} className="space-y-5">
            {fields.map(([name, label, value, maxLength]) => (
              <div key={name}>
                <Label htmlFor={`venue-event-${name}`}>{label}</Label>
                {name === "title" ? (
                  <Input
                    id={`venue-event-${name}`}
                    name={name}
                    defaultValue={value}
                    maxLength={maxLength}
                    {...fieldFeedback(errors, name, `venue-event-${name}`)}
                  />
                ) : (
                  <Textarea
                    id={`venue-event-${name}`}
                    name={name}
                    defaultValue={value}
                    maxLength={maxLength}
                    {...fieldFeedback(errors, name, `venue-event-${name}`)}
                  />
                )}
                <FieldError errors={errors} name={name} id={`venue-event-${name}`} />
              </div>
            ))}
            {event.attendance_mode === "reservations" ? (
              <>
                <div>
                  <Label htmlFor="venue-event-capacity">Capacity</Label>
                  <Input
                    id="venue-event-capacity"
                    name="capacity"
                    type="number"
                    min={1}
                    defaultValue={event.capacity ?? ""}
                    {...fieldFeedback(errors, "capacity", "venue-event-capacity")}
                  />
                  <FieldError errors={errors} name="capacity" id="venue-event-capacity" />
                </div>
                <div className="flex gap-3">
                  <Checkbox
                    id="venue-event-approval"
                    name="requiresApproval"
                    defaultChecked={event.requires_approval}
                    value="on"
                  />
                  <Label htmlFor="venue-event-approval">Review attendance requests</Label>
                </div>
              </>
            ) : (
              <input name="capacity" type="hidden" value="" />
            )}
            <div className="flex gap-3">
              <Checkbox
                id="venue-event-presence"
                name="hostPresenceConfirmed"
                value="on"
                defaultChecked={event.host_presence_confirmed}
                {...fieldFeedback(errors, "hostPresenceConfirmed", "venue-event-presence")}
              />
              <Label htmlFor="venue-event-presence">A venue host will be physically present</Label>
            </div>
            <FieldError errors={errors} name="hostPresenceConfirmed" id="venue-event-presence" />
          </fieldset>
          {hasStarted && status === "draft" ? (
            <p className="text-sm text-muted-foreground">
              This fixture has started. You can cancel this draft and plan another fixture.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {status === "draft" ? (
              <>
                <Button
                  type="submit"
                  name="intent"
                  value="publish"
                  disabled={!canPublish || pending || hasStarted}
                >
                  Publish event
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="draft"
                  variant="outline"
                  disabled={hasStarted}
                >
                  Save draft
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmCancellation(true)}>
                  Cancel draft
                </Button>
              </>
            ) : (
              <Button type="submit" name="intent" value="publish" disabled={hasStarted}>
                Save changes
              </Button>
            )}
          </div>
        </fieldset>
        {confirmCancellation && status === "draft" ? (
          <section
            aria-label="Confirm draft cancellation"
            className="space-y-3 border-t border-border pt-4"
          >
            <p>
              Cancel this draft? It will stay in event history and this fixture can be planned
              again.
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !editable}
              onClick={() => save("cancel")}
            >
              Confirm cancellation
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmCancellation(false)}
            >
              Keep draft
            </Button>
          </section>
        ) : null}
        {state?.ok ? (
          <p role="status" className="text-sm text-forest">
            {state.data.message}
          </p>
        ) : state?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error.message}
          </p>
        ) : null}
        {transportError ? (
          <p role="alert" className="text-sm text-destructive">
            We could not save this event. Your changes are still here. Please try again.
          </p>
        ) : null}
        {!editable ? (
          <p className="text-sm text-muted-foreground">
            Editing is unavailable. Event details and history remain available.
          </p>
        ) : status === "draft" && !canPublish ? (
          <p className="text-sm text-muted-foreground">
            Publishing is unavailable. You can still prepare and save this draft.
          </p>
        ) : null}
      </form>
    </FocusInvalidFields>
  );
}
