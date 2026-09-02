import type { IntentDraft, ResolvedAssistedDiscoveryIntent } from "./schemas";

export type AssistedDiscoveryCatalog = Readonly<{
  competitions: readonly Readonly<{ id: string; name: string; code: string | null }>[];
  teams: readonly Readonly<{
    id: string;
    name: string;
    shortName: string | null;
    tla?: string | null;
  }>[];
}>;

type DateRange = Readonly<{ fromDate: string; toDate: string }>;

export type ResolveIntentResult =
  | Readonly<{ status: "resolved"; intent: ResolvedAssistedDiscoveryIntent }>
  | Readonly<{
      status: "clarification";
      reason:
        "unresolved_team" | "ambiguous_team" | "unresolved_competition" | "ambiguous_competition";
    }>
  | Readonly<{
      status: "unsupported";
      reason: NonNullable<IntentDraft["unsupportedReason"]>;
    }>;

const COMPETITION_CODE_ALIASES = new Map<string, string>([
  ["epl", "PL"],
  ["premier league", "PL"],
  ["premiere league", "PL"],
  ["english premier league", "PL"],
  ["ucl", "CL"],
  ["champions league", "CL"],
  ["uefa champions league", "CL"],
]);

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveCompetition(
  mention: string,
  catalog: AssistedDiscoveryCatalog,
):
  | Readonly<{ status: "resolved"; id: string; name: string }>
  | Readonly<{ status: "unresolved" | "ambiguous" }> {
  const key = normalized(mention);
  const aliasCode = COMPETITION_CODE_ALIASES.get(key);
  const matches = catalog.competitions.filter((competition) => {
    if (aliasCode !== undefined && competition.code === aliasCode) return true;
    return (
      normalized(competition.name) === key ||
      (competition.code !== null && normalized(competition.code) === key)
    );
  });
  if (matches.length === 0) return { status: "unresolved" };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "resolved", id: matches[0].id, name: matches[0].name };
}

function resolveTeam(
  mention: string,
  catalog: AssistedDiscoveryCatalog,
):
  | Readonly<{ status: "resolved"; id: string; name: string }>
  | Readonly<{ status: "unresolved" | "ambiguous" }> {
  const key = normalized(mention);
  const matches = catalog.teams.filter((team) =>
    [team.name, team.shortName, team.tla]
      .filter((candidate): candidate is string => candidate !== null && candidate !== undefined)
      .some((candidate) => normalized(candidate) === key),
  );
  if (matches.length === 0) return { status: "unresolved" };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "resolved", id: matches[0].id, name: matches[0].name };
}

export function resolveAssistedDiscoveryIntent(
  draft: IntentDraft,
  catalog: AssistedDiscoveryCatalog,
  range: DateRange,
): ResolveIntentResult {
  if (draft.support === "unsupported") {
    return { status: "unsupported", reason: draft.unsupportedReason! };
  }

  let competitionId: string | null = null;
  let competitionName: string | null = null;
  if (draft.competitionMention !== null) {
    const competition = resolveCompetition(draft.competitionMention, catalog);
    if (competition.status !== "resolved") {
      return {
        status: "clarification",
        reason:
          competition.status === "ambiguous" ? "ambiguous_competition" : "unresolved_competition",
      };
    }
    competitionId = competition.id;
    competitionName = competition.name;
  }

  const teams: { id: string; name: string }[] = [];
  for (const mention of draft.teamMentions) {
    const team = resolveTeam(mention, catalog);
    if (team.status !== "resolved") {
      return {
        status: "clarification",
        reason: team.status === "ambiguous" ? "ambiguous_team" : "unresolved_team",
      };
    }
    if (!teams.some((candidate) => candidate.id === team.id)) teams.push(team);
  }

  const relationship = draft.relationship;
  const hostKind = relationship === "friend_host" ? "person" : draft.hostKind;
  const requiresOrigin =
    relationship === "any" || draft.proximity === "nearby" || draft.locationMention !== null;

  return {
    status: "resolved",
    intent: {
      version: 1,
      fromDate: range.fromDate,
      toDate: range.toDate,
      teamIds: teams.map((team) => team.id),
      teamNames: teams.map((team) => team.name),
      competitionId,
      competitionName,
      relationship,
      hostKind,
      proximity: draft.proximity,
      requiredFacilities: draft.requiredFacilities,
      requiresOrigin,
    },
  };
}
