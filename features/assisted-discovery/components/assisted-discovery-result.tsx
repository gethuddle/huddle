import { ArrowUpRight, CalendarDays, MapPin, UsersRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { TeamMark } from "@/features/sports/components/team-initials";
import { formatIsraelKickoff } from "@/features/sports/time";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";

import type { AssistedDiscoveryResultCard } from "../contracts";
import type { VenueFacility } from "../schemas";

const FACILITY_LABELS: Record<VenueFacility, string> = {
  wheelchair_accessible: "Wheelchair accessible",
  step_free_access: "Step-free access",
  accessible_toilet: "Accessible toilet",
  hearing_loop: "Hearing loop",
  parking: "Parking",
  food: "Food",
  drinks: "Drinks",
};

const PARTICIPATION_LABELS: Record<
  NonNullable<AssistedDiscoveryResultCard["viewerParticipationState"]>,
  string
> = {
  host: "You host this",
  requested: "Your request is pending",
  approved: "You are going",
  declined: "Your request was declined",
  left: "You left this huddle",
  removed: "You were removed",
  invited: "You are invited",
};

function attendanceSummary(result: AssistedDiscoveryResultCard): string {
  if (result.attendanceMode === "open_door") return "Open door · no RSVP needed";
  if (result.remainingCapacity === null) return `${result.approvedAttendeeCount} going`;
  return `${result.approvedAttendeeCount} going · ${result.remainingCapacity} ${result.remainingCapacity === 1 ? "place" : "places"} left`;
}

export function AssistedDiscoveryResult({
  result,
}: Readonly<{ result: AssistedDiscoveryResultCard }>) {
  const participation =
    result.viewerParticipationState === null
      ? null
      : PARTICIPATION_LABELS[result.viewerParticipationState];

  return (
    <Card
      className="gap-0 rounded-2xl border-foreground/25 py-0"
      data-presentation="ticket-card"
      role="listitem"
    >
      <CardHeader className="flex flex-row items-center gap-2.5 border-b border-border px-3 py-2.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <TeamMark
            crestUrl={result.match.homeTeamCrestUrl}
            name={result.match.homeTeamName}
            size="sm"
            tla={result.match.homeTeamTla}
          />
          <TeamMark
            crestUrl={result.match.awayTeamCrestUrl}
            name={result.match.awayTeamName}
            size="sm"
            tla={result.match.awayTeamTla}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {result.match.competitionName}
          </p>
          <p className="mt-0.5 text-sm leading-snug font-semibold text-foreground">
            {result.match.homeTeamName} vs {result.match.awayTeamName}
          </p>
        </div>
      </CardHeader>

      <CardContent className="px-3 py-2.5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h3 className="text-sm leading-snug font-semibold text-foreground">{result.title}</h3>
          {participation === null ? null : (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-forest before:size-1.5 before:rounded-full before:bg-current">
              {participation}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.72rem] leading-4 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            {formatIsraelKickoff(result.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {result.locationSummary}
          </span>
          <span className="inline-flex basis-full items-start gap-1.5">
            <UsersRound aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{attendanceSummary(result)}</span>
            {result.attendanceMode === "reservations" ? (
              <span>· {result.requiresApproval ? "Attendance review" : "Immediate join"}</span>
            ) : null}
          </span>
        </div>

        <p className="mt-1.5 text-[0.72rem] leading-4 text-muted-foreground">
          <span className="font-medium text-foreground">Hosted by {result.host.displayName}</span>
          {result.group === null ? null : (
            <>
              <span aria-hidden="true"> · </span>
              {result.group.relationship === "organizer" ? "Organized by" : "Shared with"}{" "}
              {result.group.slug === null ? (
                <span className="font-medium text-foreground">{result.group.name}</span>
              ) : (
                <Link
                  className="font-medium text-forest hover:text-forest-hover hover:underline"
                  href={`/groups/${result.group.slug}`}
                >
                  {result.group.name}
                </Link>
              )}
            </>
          )}
        </p>

        {result.venueFacilities.length === 0 ? null : (
          <p className="mt-0.5 text-[0.72rem] leading-4 text-muted-foreground">
            Self-reported venue:{" "}
            {result.venueFacilities.map((facility) => FACILITY_LABELS[facility]).join(" · ")}
          </p>
        )}

        {result.host.kind === "venue" && result.host.verificationStatus !== null ? (
          <p className="mt-0.5 leading-4 [&>span]:text-[0.68rem]">
            <VenueVerificationBadge status={result.host.verificationStatus} />
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="grid h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-0">
        {result.matchedReasons.length === 0 ? (
          <span />
        ) : (
          <div className="min-w-0 text-xs leading-5">
            {result.matchedReasons.map((reason) => (
              <span className="mr-3 font-medium text-forest" key={reason}>
                {reason}
              </span>
            ))}
          </div>
        )}
        <Button
          asChild
          className="-mr-2 h-8 px-2 text-xs text-forest hover:text-forest-hover"
          size="xs"
          variant="ghost"
        >
          <Link href={`/events/${result.id}`}>
            Open huddle
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
