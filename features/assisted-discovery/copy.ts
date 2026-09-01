import type { ClarificationReason } from "./contracts";
import type { ResolvedAssistedDiscoveryIntent, VenueFacility } from "./schemas";

const FACILITY_LABELS: Record<VenueFacility, string> = {
  wheelchair_accessible: "wheelchair access",
  step_free_access: "step-free access",
  accessible_toilet: "an accessible toilet",
  hearing_loop: "a hearing loop",
  parking: "parking",
  food: "food",
  drinks: "drinks",
};

function dateLabel(dateValue: string, includeMonth = true): string {
  const [, month, day] = dateValue.split("-").map(Number);
  const monthLabel = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month - 1];
  return includeMonth ? `${day} ${monthLabel}` : String(day);
}

function rangeLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return dateLabel(fromDate);
  const sameMonth = fromDate.slice(0, 7) === toDate.slice(0, 7);
  return `${dateLabel(fromDate, !sameMonth)}–${dateLabel(toDate)}`;
}

export function interpretationSummary(intent: ResolvedAssistedDiscoveryIntent): string {
  const parts = [rangeLabel(intent.fromDate, intent.toDate)];
  if (intent.teamNames.length > 0) parts.push(intent.teamNames.join(" and "));
  if (intent.competitionName !== null) parts.push(intent.competitionName);
  if (intent.relationship === "friend_host") parts.push("hosted by a friend");
  if (intent.relationship === "my_groups") parts.push("from one of your groups");
  if (intent.relationship === "any" && intent.hostKind === "venue") parts.push("venue-hosted");
  if (intent.proximity === "nearby") parts.push("within 15 km");
  for (const facility of intent.requiredFacilities) {
    parts.push(`venue lists ${FACILITY_LABELS[facility]}`);
  }
  return parts.join(" · ");
}

export function unsupportedSummary(
  reason:
    | "named_person_or_group"
    | "live_scores"
    | "tickets_or_payments"
    | "event_creation"
    | "outside_scope",
): string {
  return {
    named_person_or_group: "Specific friend and group names are outside assisted huddle search.",
    live_scores: "Live scores are outside assisted huddle search.",
    tickets_or_payments: "Tickets and payments are outside assisted huddle search.",
    event_creation: "Creating a huddle is outside assisted huddle search.",
    outside_scope: "That request is outside assisted huddle search.",
  }[reason];
}

export function clarificationSummary(reason: ClarificationReason): string {
  if (reason === "past_date") return "The requested dates are in the past.";
  if (reason === "date_range_too_wide") return "Choose a date range of 31 days or fewer.";
  if (reason === "invalid_date") return "The requested date range needs clarification.";
  if (reason.includes("competition")) return "The competition name needs clarification.";
  return "The team name needs clarification.";
}

export function facilityMatchedReason(facility: VenueFacility): string {
  const label = FACILITY_LABELS[facility];
  return `Venue lists ${label}.`;
}
