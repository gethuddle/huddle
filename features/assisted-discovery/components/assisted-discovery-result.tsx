import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
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
    <Item
      className="items-stretch gap-3 rounded-2xl border-border bg-card px-3 py-3 shadow-sm sm:flex-nowrap sm:items-center sm:px-4"
      role="listitem"
      size="sm"
    >
      <ItemContent className="min-w-0 basis-full gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <ItemMedia>
            <div
              aria-label={`${result.match.homeTeamName} versus ${result.match.awayTeamName}`}
              className="flex items-center gap-1.5"
            >
              <TeamMark
                crestUrl={result.match.homeTeamCrestUrl}
                name={result.match.homeTeamName}
                size="sm"
                tla={result.match.homeTeamTla}
              />
              <span
                aria-hidden="true"
                className="text-[0.65rem] font-semibold text-muted-foreground"
              >
                vs
              </span>
              <TeamMark
                crestUrl={result.match.awayTeamCrestUrl}
                name={result.match.awayTeamName}
                size="sm"
                tla={result.match.awayTeamTla}
              />
            </div>
          </ItemMedia>
          {participation === null ? null : <Badge variant="positive">{participation}</Badge>}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {result.match.competitionName} · {formatIsraelKickoff(result.startsAt)}
          </p>
          <ItemTitle className="mt-0.5 line-clamp-none text-sm font-semibold text-foreground sm:text-base">
            <h3>{result.title}</h3>
          </ItemTitle>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Hosted by {result.host.displayName}</span>
          {result.host.kind === "venue" && result.host.verificationStatus !== null ? (
            <span className="[&>span]:text-xs">
              <VenueVerificationBadge status={result.host.verificationStatus} />
            </span>
          ) : null}
          {result.group === null ? null : (
            <span>
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
            </span>
          )}
          <span>{result.locationSummary}</span>
          <span>{attendanceSummary(result)}</span>
          {result.attendanceMode === "reservations" ? (
            <span>{result.requiresApproval ? "Attendance review" : "Immediate join"}</span>
          ) : null}
        </div>

        {result.matchedReasons.length === 0 ? null : (
          <div className="flex flex-wrap gap-1.5">
            {result.matchedReasons.map((reason) => (
              <Badge key={reason} variant="positive">
                {reason}
              </Badge>
            ))}
          </div>
        )}
        {result.venueFacilities.length === 0 ? null : (
          <div aria-label="Self-reported venue facilities" className="flex flex-wrap gap-1.5">
            {result.venueFacilities.map((facility) => (
              <Badge key={facility} variant="outline">
                Self-reported: {FACILITY_LABELS[facility]}
              </Badge>
            ))}
          </div>
        )}
      </ItemContent>

      <ItemActions className="w-full sm:w-auto sm:self-center">
        <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
          <Link href={`/events/${result.id}`}>Open huddle</Link>
        </Button>
      </ItemActions>
    </Item>
  );
}
