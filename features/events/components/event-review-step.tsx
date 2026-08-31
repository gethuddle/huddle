"use client";

import { Button } from "@/components/ui/button";
import type { PrivateEventCatalog } from "@/features/events/catalog";
import type { EventDraftPatch, EventDraftProtectedLocation } from "@/features/events/schemas";
import type { FixtureOption } from "@/features/sports/fixture-option-schemas";
import { formatIsraelKickoff } from "@/features/sports/time";

type EventReviewStepProps = Readonly<{
  catalog: PrivateEventCatalog;
  organizingGroupId: string | null;
  protectedLocation: EventDraftProtectedLocation | null;
  selectedMatch: FixtureOption | null;
  values: EventDraftPatch;
  onEdit: (step: 1 | 2) => void;
}>;

export function EventReviewStep({
  catalog,
  onEdit,
  organizingGroupId,
  protectedLocation,
  selectedMatch,
  values,
}: EventReviewStepProps) {
  const match =
    selectedMatch !== null && selectedMatch.id === values.matchId
      ? selectedMatch
      : catalog.matches.find((candidate) => candidate.id === values.matchId);
  const group = catalog.groups.find((candidate) => candidate.id === values.audienceGroupId);
  const organizer = catalog.groups.find((candidate) => candidate.id === organizingGroupId);
  const place =
    values.placeKind === "home"
      ? protectedLocation === null
        ? "Protected home location not set"
        : "Protected home address confirmed"
      : (values.publicAddressText ?? "Public address not set");

  return (
    <div className="space-y-5">
      <ReviewSection title="Match">
        <p className="font-semibold text-foreground">{match?.label ?? "Fixture not selected"}</p>
        {match === undefined ? null : (
          <p className="mt-1 text-sm text-muted-foreground">
            {formatIsraelKickoff(match.startsAt)}
          </p>
        )}
        <Button className="mt-4" onClick={() => onEdit(1)} type="button" variant="outline">
          Edit match
        </Button>
      </ReviewSection>

      <ReviewSection title="Place and audience">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="Title" value={values.title ?? "Not set"} />
          <Detail label="Place" value={place} />
          <Detail
            label="Audience"
            value={
              values.audience === "group"
                ? (group?.name ?? "Group not selected")
                : values.audience === "friends"
                  ? "Friends"
                  : "Invite only"
            }
          />
          <Detail label="Capacity" value={String(values.capacity ?? "Not set")} />
          <Detail
            label="Organized by"
            value={
              values.audience === "group"
                ? (group?.name ?? "Group not selected")
                : (organizer?.name ?? "You")
            }
          />
        </dl>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {values.description}
        </p>
        <Button className="mt-4" onClick={() => onEdit(2)} type="button" variant="outline">
          Edit place and audience
        </Button>
      </ReviewSection>
    </div>
  );
}

function ReviewSection({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className="rounded-[1.375rem] border border-border bg-card p-5">
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
