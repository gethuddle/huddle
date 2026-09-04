"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { VenueEventCatalog } from "@/features/events/catalog";
import { FixtureCombobox } from "@/features/events/components/fixture-combobox";
import type { FixtureOption } from "@/features/sports/fixture-option-schemas";
import { formatIsraelKickoff } from "@/features/sports/time";
import { planVenueEventsAction } from "@/features/venues/workspace/actions";
import type { VenuePlanItem, VenueSpace } from "@/features/venues/workspace/types";
import type { FixturePlannerBillingCapabilities } from "@/features/venue-billing/types";

type PlannerVenue = Readonly<{
  id: string;
  slug: string;
  name: string;
  addressText: string;
  houseInformation: string;
  defaultRequiresApproval: boolean;
  defaultAttendanceMode: "open_door" | "reservations";
  spaces: readonly VenueSpace[];
}>;

type Selection = VenuePlanItem;

function emptySelection(
  matchId: string,
  venueSpaceId: string,
  attendanceMode: "open_door" | "reservations",
): Selection {
  return {
    matchId,
    venueSpaceId,
    attendanceMode,
    title: null,
    description: null,
    capacity: null,
    requiresApproval: null,
  };
}

export function FixturePlanner({
  catalog,
  initialMatchId = "",
  venue,
  billing = {
    canPublish: false,
    canPrepareDrafts: false,
    publishCutoffAt: null,
    blockedReason: "Open Billing to continue.",
  },
}: Readonly<{
  catalog: VenueEventCatalog;
  initialMatchId?: string;
  venue: PlannerVenue;
  billing?: FixturePlannerBillingCapabilities;
}>) {
  const usableInitialMatch = catalog.matches.some((match) => match.id === initialMatchId)
    ? initialMatchId
    : "";
  const [phase, setPhase] = useState<"select" | "review">("select");
  const [retainedMatches, setRetainedMatches] = useState<readonly FixtureOption[]>([]);
  const defaultSpaceId = venue.spaces.find((space) => space.active)?.id ?? "";
  const [items, setItems] = useState<readonly Selection[]>(
    usableInitialMatch === ""
      ? []
      : [emptySelection(usableInitialMatch, defaultSpaceId, venue.defaultAttendanceMode)],
  );
  const [result, setResult] = useState<Awaited<ReturnType<typeof planVenueEventsAction>> | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const activeSpaces = useMemo(() => venue.spaces.filter((space) => space.active), [venue.spaces]);
  const matches = useMemo(
    () =>
      new Map([...catalog.matches, ...retainedMatches].map((match) => [match.id, match] as const)),
    [catalog.matches, retainedMatches],
  );
  const spaces = useMemo(
    () => new Map(activeSpaces.map((space) => [space.id, space])),
    [activeSpaces],
  );

  const conflicts = useMemo(() => {
    const conflictIndexes = new Set<number>();
    for (let first = 0; first < items.length; first += 1) {
      const firstItem = items[first];
      const firstMatch = firstItem === undefined ? undefined : matches.get(firstItem.matchId);
      if (firstItem === undefined || firstMatch === undefined || firstItem.venueSpaceId === "")
        continue;
      const firstStart = Date.parse(firstMatch.startsAt);
      for (let second = first + 1; second < items.length; second += 1) {
        const secondItem = items[second];
        const secondMatch = secondItem === undefined ? undefined : matches.get(secondItem.matchId);
        if (
          secondItem === undefined ||
          secondMatch === undefined ||
          secondItem.venueSpaceId !== firstItem.venueSpaceId
        ) {
          continue;
        }
        const secondStart = Date.parse(secondMatch.startsAt);
        if (
          firstStart < secondStart + 3 * 60 * 60 * 1000 &&
          secondStart < firstStart + 3 * 60 * 60 * 1000
        ) {
          conflictIndexes.add(first);
          conflictIndexes.add(second);
        }
      }
    }
    return conflictIndexes;
  }, [items, matches]);

  const complete =
    items.length > 0 &&
    items.every((item) => {
      const space = spaces.get(item.venueSpaceId);
      return (
        space !== undefined && (item.attendanceMode === "open_door" || space.capacity !== null)
      );
    }) &&
    conflicts.size === 0;

  function updateItem(index: number, update: Partial<Selection>) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)),
    );
  }

  function addMatch(match: FixtureOption) {
    setRetainedMatches((current) =>
      current.some((candidate) => candidate.id === match.id) ? current : [...current, match],
    );
    setItems((current) =>
      current.some((item) => item.matchId === match.id)
        ? current
        : [...current, emptySelection(match.id, defaultSpaceId, venue.defaultAttendanceMode)],
    );
  }

  function submit(intent: "draft" | "publish") {
    if (!billing.canPrepareDrafts || (intent === "publish" && !canPublishBatch)) return;
    startTransition(async () => {
      const actionResult = await planVenueEventsAction({
        venueId: venue.id,
        venueSlug: venue.slug,
        intent,
        items,
      });
      setResult(actionResult);
    });
  }

  const withinCutoff =
    billing.publishCutoffAt === null ||
    items.every((item) => {
      const match = matches.get(item.matchId);
      return (
        match !== undefined && Date.parse(match.startsAt) < Date.parse(billing.publishCutoffAt!)
      );
    });
  const canPublishBatch = billing.canPublish && withinCutoff;

  if (!billing.canPrepareDrafts)
    return (
      <p className="text-muted-foreground">
        Editing is locked.{" "}
        <Link
          className="font-semibold text-forest underline"
          href={`/venues/${venue.slug}/workspace/billing`}
        >
          Open Billing
        </Link>{" "}
        to recover access. Your calendar and event history remain available.
      </p>
    );

  if (result?.ok === true) {
    return (
      <div className="rounded-[1.375rem] border border-court/30 bg-court/10 p-6" role="status">
        <h2 className="text-2xl font-semibold">Batch saved</h2>
        <p className="mt-2 text-muted-foreground">{result.data.message}</p>
        <Button asChild className="mt-5">
          <Link href={`/venues/${venue.slug}/workspace/calendar`}>Open calendar</Link>
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="venue-planner-phase-heading"
      className="space-y-8 rounded-[1.75rem] border border-border bg-muted p-5 sm:p-7"
    >
      <div className="flex items-center gap-3" aria-label="Planning progress">
        <span
          className={phase === "select" ? "font-semibold text-forest" : "text-muted-foreground"}
        >
          1. Fixtures and areas
        </span>
        <span aria-hidden="true">→</span>
        <span
          className={phase === "review" ? "font-semibold text-forest" : "text-muted-foreground"}
        >
          2. Review
        </span>
      </div>

      {phase === "select" ? (
        <>
          <div>
            <h2 className="text-2xl font-semibold" id="venue-planner-phase-heading">
              Pick the fixtures you will show
            </h2>
            <p className="mt-2 text-muted-foreground">
              Dates and kickoff times come with each fixture. Choose up to 20 and use your usual
              venue defaults.
            </p>
          </div>

          {activeSpaces.length === 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                Add an active viewing area in Venue settings before planning.
              </AlertDescription>
            </Alert>
          ) : (
            <FixtureCombobox
              initialHasMore={catalog.matchesHasMore}
              matches={catalog.matches}
              onValueChange={addMatch}
              onValueRemove={(matchId) =>
                setItems((current) => current.filter((item) => item.matchId !== matchId))
              }
              selectedValues={items.map((item) => item.matchId)}
              selectionLabels={Object.fromEntries(
                items.map((item) => [
                  item.matchId,
                  spaces.get(item.venueSpaceId)?.name ?? "No area",
                ]),
              )}
              value=""
            />
          )}

          {activeSpaces.length > 1 && items.length > 0 ? (
            <section aria-labelledby="planner-area-heading">
              <h3 className="text-lg font-semibold" id="planner-area-heading">
                Assign viewing areas
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Huddle uses your default area unless you choose another one.
              </p>
              <ol className="mt-4 overflow-hidden rounded-2xl border border-border">
                {items.map((item, index) => {
                  const match = matches.get(item.matchId);
                  if (match === undefined) return null;
                  return (
                    <li
                      className="grid gap-3 border-b border-border bg-card p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.45fr)] sm:items-center"
                      key={item.matchId}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{match.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatIsraelKickoff(match.startsAt)}
                        </p>
                      </div>
                      <div>
                        <Label className="sr-only" htmlFor={`planner-space-${index}`}>
                          Viewing area for {match.label}
                        </Label>
                        <NativeSelect
                          aria-label={`Viewing area for ${match.label}`}
                          id={`planner-space-${index}`}
                          onChange={(event) =>
                            updateItem(index, { venueSpaceId: event.currentTarget.value })
                          }
                          value={item.venueSpaceId}
                        >
                          <NativeSelectOption value="">Choose an active area</NativeSelectOption>
                          {activeSpaces.map((space) => (
                            <NativeSelectOption key={space.id} value={space.id}>
                              {space.name}
                              {space.capacity === null
                                ? " · open door"
                                : ` · ${space.capacity} places`}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {conflicts.size > 0 ? (
            <Alert role="alert" variant="destructive">
              <AlertDescription>
                Two selected fixtures overlap in the same viewing area. Remove one or assign a
                different area.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? "Choose at least one fixture."
                : `${items.length} ${items.length === 1 ? "fixture" : "fixtures"} selected`}
            </p>
            <Button disabled={!complete} onClick={() => setPhase("review")} size="lg" type="button">
              Review events
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-semibold" id="venue-planner-phase-heading">
              Review inherited details
            </h2>
            <p className="mt-2 text-muted-foreground">
              Venue defaults remain reusable. Only add an override when this event truly differs.
            </p>
          </div>

          <div className="rounded-[1.375rem] border border-border bg-card p-5">
            <p className="font-semibold">{venue.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{venue.addressText}</p>
            {venue.houseInformation === "" ? null : (
              <p className="mt-3 text-sm text-muted-foreground">{venue.houseInformation}</p>
            )}
          </div>

          <ol className="space-y-5">
            {items.map((item, index) => {
              const match = matches.get(item.matchId);
              const space = spaces.get(item.venueSpaceId);
              if (match === undefined || space === undefined) return null;
              return (
                <li
                  className="rounded-[1.375rem] border border-border bg-card p-5"
                  key={item.matchId}
                >
                  <h3 className="text-xl font-semibold">{match.label}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatIsraelKickoff(match.startsAt)} · {space.name}
                  </p>
                  <div className="mt-5">
                    <Label htmlFor={`planner-attendance-${index}`}>Attendance</Label>
                    <NativeSelect
                      id={`planner-attendance-${index}`}
                      onChange={(event) => {
                        const attendanceMode = event.currentTarget.value as
                          "open_door" | "reservations";
                        updateItem(index, {
                          attendanceMode,
                          capacity: attendanceMode === "open_door" ? null : item.capacity,
                          requiresApproval:
                            attendanceMode === "open_door" ? null : item.requiresApproval,
                        });
                      }}
                      value={item.attendanceMode}
                    >
                      <NativeSelectOption value="open_door">
                        Open door — no RSVP needed
                      </NativeSelectOption>
                      <NativeSelectOption disabled={space.capacity === null} value="reservations">
                        Reservations and guest list
                      </NativeSelectOption>
                    </NativeSelect>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.attendanceMode === "open_door"
                        ? "Open door — no RSVP, invitations, approval queue, or capacity claim."
                        : `${space.capacity} registered accounts · ${venue.defaultRequiresApproval ? "Staff approval required" : "Immediate joining"}`}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`planner-title-${index}`}>Custom title (optional)</Label>
                      <Input
                        id={`planner-title-${index}`}
                        maxLength={120}
                        onChange={(event) =>
                          updateItem(index, { title: event.currentTarget.value || null })
                        }
                        value={item.title ?? ""}
                      />
                    </div>
                    {item.attendanceMode === "reservations" ? (
                      <div>
                        <Label htmlFor={`planner-capacity-${index}`}>
                          Lower capacity (optional)
                        </Label>
                        <Input
                          id={`planner-capacity-${index}`}
                          max={space.capacity ?? undefined}
                          min={1}
                          onChange={(event) =>
                            updateItem(index, {
                              capacity:
                                event.currentTarget.value === ""
                                  ? null
                                  : Number(event.currentTarget.value),
                            })
                          }
                          type="number"
                          value={item.capacity ?? ""}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-5">
                    <Label htmlFor={`planner-description-${index}`}>
                      Custom description (optional)
                    </Label>
                    <Textarea
                      id={`planner-description-${index}`}
                      maxLength={2000}
                      onChange={(event) =>
                        updateItem(index, { description: event.currentTarget.value || null })
                      }
                      value={item.description ?? ""}
                    />
                  </div>
                  {item.attendanceMode === "reservations" ? (
                    <div className="mt-5">
                      <Label htmlFor={`planner-approval-${index}`}>Joining policy</Label>
                      <NativeSelect
                        id={`planner-approval-${index}`}
                        onChange={(event) =>
                          updateItem(index, {
                            requiresApproval:
                              event.currentTarget.value === "inherit"
                                ? null
                                : event.currentTarget.value === "approval",
                          })
                        }
                        value={
                          item.requiresApproval === null
                            ? "inherit"
                            : item.requiresApproval
                              ? "approval"
                              : "immediate"
                        }
                      >
                        <NativeSelectOption value="inherit">Use venue default</NativeSelectOption>
                        <NativeSelectOption value="approval">
                          Staff approval required
                        </NativeSelectOption>
                        <NativeSelectOption value="immediate">Immediate joining</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {result?.ok === false ? (
            <Alert role="alert" variant="destructive">
              <AlertDescription>
                {result.error.message} No event in this batch was created.
              </AlertDescription>
            </Alert>
          ) : null}

          {!canPublishBatch ? (
            <p className="text-sm text-muted-foreground">
              {!withinCutoff
                ? "This batch includes a fixture at or after your demo subscription ends. Save drafts or choose an earlier fixture."
                : (billing.blockedReason ??
                  "Publishing is unavailable. You can still save drafts.")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={pending || !canPublishBatch}
              onClick={() => submit("publish")}
              size="lg"
              type="button"
            >
              {pending ? "Saving batch…" : "Publish batch"}
            </Button>
            <Button
              disabled={pending}
              onClick={() => submit("draft")}
              size="lg"
              type="button"
              variant="outline"
            >
              Save batch as drafts
            </Button>
            <Button
              disabled={pending}
              onClick={() => setPhase("select")}
              type="button"
              variant="ghost"
            >
              Back
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
