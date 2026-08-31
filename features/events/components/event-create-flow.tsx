"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { finalizeEventDraftAction, saveEventDraftStepAction } from "@/features/events/actions";
import type { PrivateEventCatalog } from "@/features/events/catalog";
import { EventPlaceStep } from "@/features/events/components/event-place-step";
import { EventReviewStep } from "@/features/events/components/event-review-step";
import { FixtureCombobox } from "@/features/events/components/fixture-combobox";
import type { EventDraftPatch, EventDraftProtectedLocation } from "@/features/events/schemas";
import type { EventDraftState } from "@/features/events/state";
import type { FixtureOption } from "@/features/sports/fixture-option-schemas";

type EventCreateFlowProps = Readonly<{
  catalog: PrivateEventCatalog;
  initialDraft?: EventDraftState | null;
  initialMatchId?: string;
  initialOrganizingGroupId?: string | null;
  initialProtectedLocation?: EventDraftProtectedLocation | null;
}>;

type ReviewIssue = Readonly<{
  fieldId: string;
  message: string;
}>;

const defaults: EventDraftPatch = {
  title: "",
  description: "",
  expectedActivity: "Watch the full match together",
  costDescription: "Free",
  eventRules: "Respect the host, the place, and every attendee.",
  commercialAffiliation: "None",
  hostPresenceConfirmed: false,
  placeKind: "home",
  audience: "invite_only",
  capacity: 6,
};

function usefulPatch(values: EventDraftPatch): EventDraftPatch {
  const entries = Object.entries(values).filter(([, value]) => {
    if (value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
  return Object.fromEntries(entries) as EventDraftPatch;
}

function reviewIssues(
  values: EventDraftPatch,
  protectedLocation: EventDraftProtectedLocation | null,
): readonly ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  if (values.matchId == null) {
    issues.push({ fieldId: "fixture-search", message: "Choose a future fixture." });
  }
  if ((values.title?.trim().length ?? 0) < 3) {
    issues.push({
      fieldId: "event-title",
      message: "Use at least 3 characters for the event title.",
    });
  }
  if ((values.description?.trim().length ?? 0) < 10) {
    issues.push({
      fieldId: "event-description",
      message: "Use at least 10 characters for the description.",
    });
  }
  if (values.cityId == null) {
    issues.push({ fieldId: "event-city", message: "Choose the event city." });
  }
  if (values.placeKind === "home") {
    if (protectedLocation === null) {
      issues.push({
        fieldId: "event-private-location",
        message: "Choose the private address and pin.",
      });
    }
    if ((values.capacity ?? 0) > 12) {
      issues.push({
        fieldId: "event-capacity",
        message: "Home events can include at most 12 people.",
      });
    }
  } else if (values.placeKind === "public_place") {
    if ((values.publicPlaceName?.trim().length ?? 0) === 0) {
      issues.push({ fieldId: "event-public-place", message: "Enter the public place name." });
    }
    if (
      values.publicAddressText == null ||
      values.publicLatitude == null ||
      values.publicLongitude == null
    ) {
      issues.push({
        fieldId: "event-public-address",
        message: "Choose a suggested public address.",
      });
    }
  }
  if (values.audience == null) {
    issues.push({ fieldId: "event-audience", message: "Choose who can see this event." });
  }
  if (values.audience === "group" && values.audienceGroupId == null) {
    issues.push({ fieldId: "event-audience-group", message: "Choose the audience group." });
  }
  if ((values.capacity ?? 0) < 1) {
    issues.push({ fieldId: "event-capacity", message: "Enter at least one person." });
  }
  if (values.hostPresenceConfirmed !== true) {
    issues.push({
      fieldId: "event-host-presence",
      message: "Confirm that you will be present.",
    });
  }
  return issues;
}

export function EventCreateFlow({
  catalog,
  initialDraft = null,
  initialMatchId = "",
  initialOrganizingGroupId = null,
  initialProtectedLocation = null,
}: EventCreateFlowProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<1 | 2 | 3>(initialDraft?.step ?? 1);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [values, setValues] = useState<EventDraftPatch>({
    ...defaults,
    ...(initialMatchId === "" ? {} : { matchId: initialMatchId }),
    ...initialDraft?.values,
  });
  const [selectedMatch, setSelectedMatch] = useState<FixtureOption | null>(() => {
    const selectedMatchId = initialDraft?.values.matchId ?? initialMatchId;
    return catalog.matches.find((match) => match.id === selectedMatchId) ?? null;
  });
  const [organizingGroupId, setOrganizingGroupId] = useState<string | null>(
    initialOrganizingGroupId,
  );
  const [protectedLocation, setProtectedLocation] = useState<EventDraftProtectedLocation | null>(
    initialProtectedLocation,
  );
  const [protectedLocationChanged, setProtectedLocationChanged] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const [saving, startSaving] = useTransition();
  const activeReviewIssues = reviewAttempted ? reviewIssues(values, protectedLocation) : [];
  const fieldErrors = Object.fromEntries(
    activeReviewIssues.map((issue) => [issue.fieldId, issue.message]),
  );
  const selectableMatches = useMemo(
    () =>
      selectedMatch === null || catalog.matches.some((match) => match.id === selectedMatch.id)
        ? catalog.matches
        : [...catalog.matches, selectedMatch],
    [catalog.matches, selectedMatch],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateValues(patch: EventDraftPatch) {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function updateProtectedLocation(location: EventDraftProtectedLocation | null) {
    setProtectedLocation(location);
    setProtectedLocationChanged(true);
    setDirty(true);
  }

  async function save(nextPhase: 1 | 2 | 3): Promise<string | null> {
    setError(null);
    if (values.matchId == null) {
      setError("Choose a future fixture before continuing.");
      return null;
    }
    if (nextPhase === 3) {
      const issues = reviewIssues(values, protectedLocation);
      if (issues.length > 0) {
        setReviewAttempted(true);
        document.getElementById(issues[0]?.fieldId ?? "")?.focus();
        return null;
      }
      setReviewAttempted(false);
    }

    const result = await saveEventDraftStepAction({
      id: draftId,
      step: nextPhase,
      values: usefulPatch(values),
      organizingGroupId,
      privateLocation:
        values.placeKind !== "home"
          ? { mode: "clear" as const }
          : protectedLocationChanged
            ? protectedLocation === null
              ? { mode: "clear" as const }
              : { mode: "replace" as const, value: protectedLocation }
            : { mode: "preserve" as const },
    });
    if (!result.ok) {
      setError(result.error.message);
      return null;
    }

    const firstSave = draftId === null;
    setDraftId(result.data.draft.id);
    setValues({ ...defaults, ...result.data.draft.values });
    setSelectedMatch((current) => {
      const savedMatchId = result.data.draft.values.matchId;
      if (savedMatchId == null) return null;
      if (current?.id === savedMatchId) return current;
      return catalog.matches.find((match) => match.id === savedMatchId) ?? null;
    });
    setOrganizingGroupId(result.data.organizingGroupId);
    setProtectedLocation(result.data.protectedLocation);
    setProtectedLocationChanged(false);
    setDirty(false);
    setPhase(nextPhase);
    if (firstSave) router.replace(`/events/new?draft=${result.data.draft.id}`);
    return result.data.draft.id;
  }

  function move(nextPhase: 1 | 2 | 3) {
    startSaving(() => void save(nextPhase));
  }

  function publish() {
    if (draftId === null) {
      setError("Save the draft before publishing.");
      return;
    }
    setError(null);
    startSaving(async () => {
      const result = await finalizeEventDraftAction({ draftId });
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <div className="space-y-6">
      <ol aria-label="Event creation progress" className="grid gap-2 sm:grid-cols-3">
        {([1, 2, 3] as const).map((step) => (
          <li
            aria-current={phase === step ? "step" : undefined}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground aria-current:border-primary aria-current:text-primary"
            key={step}
          >
            {step}.{" "}
            {step === 1 ? "Match" : step === 2 ? "Place and audience" : "Review and publish"}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent>
          {phase === 1 ? (
            <section aria-labelledby="event-create-match-title">
              <h2
                className="text-3xl font-semibold tracking-[-0.04em] text-foreground"
                id="event-create-match-title"
              >
                Match
              </h2>
              <p className="mt-2 text-muted-foreground">
                Search the local fixture list. Teams and competitions you follow appear first.
              </p>
              <div className="mt-7">
                <FixtureCombobox
                  initialHasMore={catalog.matchesHasMore}
                  matches={selectableMatches}
                  onValueChange={(match) => {
                    setSelectedMatch(match);
                    updateValues({ matchId: match.id });
                  }}
                  value={values.matchId ?? ""}
                />
              </div>
            </section>
          ) : phase === 2 ? (
            <section aria-labelledby="event-create-place-title">
              <h2
                className="text-3xl font-semibold tracking-[-0.04em] text-foreground"
                id="event-create-place-title"
              >
                Place and audience
              </h2>
              <p className="mt-2 text-muted-foreground">
                Set the truthful place, eligible audience, capacity, and host details.
              </p>
              <div className="mt-7">
                <EventPlaceStep
                  catalog={catalog}
                  onFindFirstFriend={() => {
                    startSaving(async () => {
                      const savedDraftId = await save(2);
                      if (savedDraftId === null) return;
                      router.push(
                        `/people?returnTo=${encodeURIComponent(`/events/new?draft=${savedDraftId}`)}`,
                      );
                    });
                  }}
                  onOrganizingGroupChange={(groupId) => {
                    setOrganizingGroupId(groupId);
                    setDirty(true);
                  }}
                  onProtectedLocationChange={updateProtectedLocation}
                  onValuesChange={updateValues}
                  organizingGroupId={organizingGroupId}
                  protectedLocation={protectedLocation}
                  saving={saving}
                  values={values}
                  fieldErrors={fieldErrors}
                />
              </div>
            </section>
          ) : (
            <section aria-labelledby="event-create-review-title">
              <h2
                className="text-3xl font-semibold tracking-[-0.04em] text-foreground"
                id="event-create-review-title"
              >
                Review and publish
              </h2>
              <p className="mt-2 text-muted-foreground">
                Check the human-readable details before saving the event.
              </p>
              <div className="mt-7">
                <EventReviewStep
                  catalog={catalog}
                  onEdit={setPhase}
                  organizingGroupId={organizingGroupId}
                  protectedLocation={protectedLocation}
                  selectedMatch={selectedMatch}
                  values={values}
                />
              </div>
            </section>
          )}
        </CardContent>
      </Card>

      {error === null ? null : (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {activeReviewIssues.length === 0 ? null : (
        <Alert role="alert" variant="destructive">
          <AlertDescription>
            <p className="font-semibold">
              Fix {activeReviewIssues.length}{" "}
              {activeReviewIssues.length === 1 ? "detail" : "details"} before review
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {activeReviewIssues.map((issue) => (
                <li key={`${issue.fieldId}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        {phase === 1 ? (
          <span />
        ) : (
          <Button
            disabled={saving}
            onClick={() => move(phase === 2 ? 1 : 2)}
            type="button"
            variant="outline"
          >
            Back
          </Button>
        )}
        {phase === 1 ? (
          <Button disabled={saving} onClick={() => move(2)} type="button">
            {saving ? "Saving…" : "Next: place and audience"}
          </Button>
        ) : phase === 2 ? (
          <Button disabled={saving} onClick={() => move(3)} type="button">
            {saving ? "Saving…" : "Next: review and publish"}
          </Button>
        ) : (
          <Button disabled={saving} onClick={publish} type="button">
            {saving
              ? "Publishing…"
              : values.audience === "group" || organizingGroupId !== null
                ? "Submit event"
                : "Publish event"}
          </Button>
        )}
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {dirty
          ? "Changes not saved yet."
          : draftId === null
            ? "Start by choosing a fixture."
            : "Draft saved."}
      </p>
    </div>
  );
}
