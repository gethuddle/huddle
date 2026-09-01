"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressSearch } from "@/features/locations/components/address-search";
import type { AddressSuggestion } from "@/features/locations/types";
import { activateVenueOnboardingAction } from "@/features/workspaces/actions";
import type { WorkspaceActionState } from "@/features/workspaces/state";
import {
  clearSessionFormDraft,
  onboardingSessionDraftKey,
  readSessionFormDraft,
  restoreFormDraft,
  writeSessionFormDraft,
  type StoredFormDraft,
} from "@/features/onboarding/session-form-draft";

type AttendanceMode = "open_door" | "reservations";
type VenueDraftExtra = Readonly<{ address: AddressSuggestion | null }>;

const FACILITIES = [
  ["wheelchair_accessible", "Wheelchair accessible"],
  ["step_free_access", "Step-free access"],
  ["accessible_toilet", "Accessible toilet"],
  ["hearing_loop", "Hearing loop"],
  ["parking", "Parking"],
  ["food", "Food"],
  ["drinks", "Drinks"],
] as const;

export function VenueOnboardingForm({ ownerId }: Readonly<{ ownerId: string }>) {
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = onboardingSessionDraftKey("venue", ownerId);
  const restoredDraftRef = useRef<StoredFormDraft<VenueDraftExtra> | null>(null);
  const [address, setAddress] = useState<AddressSuggestion | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("reservations");
  const [state, setState] = useState<WorkspaceActionState>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const draft = readSessionFormDraft<VenueDraftExtra>(draftKey);
    if (draft === null) return;
    restoredDraftRef.current = draft;
    const frame = window.requestAnimationFrame(() => {
      setAttendanceMode(draft.values.attendanceMode === "open_door" ? "open_door" : "reservations");
      setAddress(draft.extra?.address ?? null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftKey]);

  useEffect(() => {
    if (formRef.current === null) return;
    if (restoredDraftRef.current !== null) {
      restoreFormDraft(formRef.current, restoredDraftRef.current);
      restoredDraftRef.current = null;
      return;
    }
    writeSessionFormDraft(draftKey, formRef.current, { address });
  }, [address, attendanceMode, draftKey]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const confirmedAddress = address;
    if (confirmedAddress === null) {
      setState({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Search for and confirm the public venue address.",
        },
      });
      return;
    }

    startTransition(async () => {
      const result = await activateVenueOnboardingAction({
        name: formData.get("name") as string,
        slug: formData.get("slug") as string,
        address: confirmedAddress,
        description: formData.get("description") as string,
        mainSpaceName: formData.get("mainSpaceName") as string,
        mainSpaceCapacity:
          attendanceMode === "reservations" ? Number(formData.get("mainSpaceCapacity")) : null,
        defaultAttendanceMode: attendanceMode,
        facilities: formData.getAll("facilities") as string[],
        houseInformation: formData.get("houseInformation") as string,
        defaultRequiresApproval:
          attendanceMode === "reservations" && formData.get("defaultRequiresApproval") === "on",
        representationAttested: formData.get("representationAttested") === "on",
      });
      setState(result);
      if (result?.ok === true) {
        clearSessionFormDraft(draftKey);
        window.location.assign(result.data.redirectTo);
      }
    });
  }

  return (
    <form
      className="space-y-7"
      noValidate
      onChange={(event) => writeSessionFormDraft(draftKey, event.currentTarget, { address })}
      onInput={(event) => writeSessionFormDraft(draftKey, event.currentTarget, { address })}
      onSubmit={submit}
      ref={formRef}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="venue-name">Venue name</Label>
          <Input autoComplete="organization" id="venue-name" maxLength={120} name="name" required />
        </div>
        <div>
          <Label htmlFor="venue-slug">Venue URL</Label>
          <Input
            aria-describedby="venue-slug-help"
            autoCapitalize="none"
            id="venue-slug"
            maxLength={80}
            name="slug"
            placeholder="match-corner"
            required
          />
          <p className="mt-2 text-xs text-muted-foreground" id="venue-slug-help">
            Lowercase letters, numbers, and hyphens.
          </p>
        </div>
      </div>

      <AddressSearch onConfirm={setAddress} purpose="public_address" />

      {address === null ? null : (
        <div className="rounded-2xl border border-court/30 bg-court/10 p-5" role="status">
          <p className="text-sm font-medium text-forest">Confirmed public address</p>
          <p className="mt-2 text-sm text-foreground">{address.label}</p>
        </div>
      )}

      <div>
        <Label htmlFor="venue-description">Public description</Label>
        <Textarea
          id="venue-description"
          maxLength={2000}
          minLength={10}
          name="description"
          placeholder="What should fans know about watching a match here?"
          required
        />
      </div>

      <fieldset className="rounded-2xl border border-border p-5">
        <legend className="px-2 font-semibold">How fans attend your usual events</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted p-4 has-[:checked]:border-court">
            <input
              checked={attendanceMode === "open_door"}
              className="mt-1 size-4 accent-court"
              name="attendanceMode"
              onChange={() => setAttendanceMode("open_door")}
              type="radio"
              value="open_door"
            />
            <span>
              <span className="block font-semibold text-foreground">Open door</span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                No RSVP, guest list, approval, or capacity claim. Fans simply come along.
              </span>
            </span>
          </label>
          <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted p-4 has-[:checked]:border-court">
            <input
              checked={attendanceMode === "reservations"}
              className="mt-1 size-4 accent-court"
              name="attendanceMode"
              onChange={() => setAttendanceMode("reservations")}
              type="radio"
              value="reservations"
            />
            <span>
              <span className="block font-semibold text-foreground">Reservations</span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                Track registered attendees with a real capacity and optional staff approval.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 rounded-2xl border border-border p-5 sm:grid-cols-2">
        <legend className="px-2 font-semibold">First viewing area</legend>
        <div>
          <Label htmlFor="venue-space-name">Area name</Label>
          <Input defaultValue="Main screen" id="venue-space-name" name="mainSpaceName" required />
        </div>
        {attendanceMode === "reservations" ? (
          <div>
            <Label htmlFor="venue-space-capacity">Capacity</Label>
            <Input
              id="venue-space-capacity"
              min={1}
              name="mainSpaceCapacity"
              required
              type="number"
            />
          </div>
        ) : (
          <p className="self-end text-sm leading-6 text-muted-foreground">
            Open-door areas do not need a capacity. You can add a reservable area later.
          </p>
        )}
      </fieldset>

      <fieldset className="rounded-2xl border border-border p-5">
        <legend className="px-2 font-semibold">Facilities</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {FACILITIES.map(([value, label]) => (
            <div className="flex min-h-11 items-center gap-3" key={value}>
              <Checkbox id={`venue-facility-${value}`} name="facilities" value={value} />
              <Label className="cursor-pointer" htmlFor={`venue-facility-${value}`}>
                {label}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="venue-house-information">House information (optional)</Label>
        <Textarea
          id="venue-house-information"
          maxLength={1000}
          name="houseInformation"
          placeholder="Ordering, arrival, accessibility, or match-day information that applies by default."
        />
      </div>

      {attendanceMode === "reservations" ? (
        <div className="flex min-h-11 items-start gap-3">
          <Checkbox id="venue-default-approval" name="defaultRequiresApproval" value="on" />
          <Label className="cursor-pointer leading-6" htmlFor="venue-default-approval">
            Review attendance requests by default.
          </Label>
        </div>
      ) : null}

      <div className="flex min-h-11 items-start gap-3 rounded-2xl border border-sand/40 p-5">
        <Checkbox id="venue-representation" name="representationAttested" value="on" />
        <Label className="cursor-pointer text-sm leading-6" htmlFor="venue-representation">
          I truthfully represent this business and am authorized to manage its Huddle listing. I
          understand that “Self-listed” means Huddle has not checked the business or this claim.
        </Label>
      </div>

      {state?.ok === false ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button className="w-full" disabled={pending || address === null} size="lg" type="submit">
        {pending ? "Creating venue account…" : "Create venue account"}
      </Button>
    </form>
  );
}
