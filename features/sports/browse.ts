import "server-only";

import { DomainError } from "@/lib/errors";
import { safeLog } from "@/lib/observability/server";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";

import type { FixtureFilters } from "./browse-schemas";
import { toPublicMatchDto, type PublicMatchDto } from "./dto";
import { deriveFixtureFreshness, fixtureSyncAgeSeconds, type FixtureFreshness } from "./freshness";
import { FIXTURES_PER_PAGE, fixtureQueryPlan } from "./query";

const PUBLIC_MATCH_SELECT =
  "id, sport_id, sport_slug, competition_id, competition_code, competition_name, home_team_id, home_team_name, home_team_short_name, home_team_tla, away_team_id, away_team_name, away_team_short_name, away_team_tla, starts_at, status, matchday, stage, season_label, last_synced_at, home_team_crest_url, away_team_crest_url";

export type CompetitionFilterOption = Readonly<{
  id: string;
  name: string;
  code: string | null;
}>;

export type TeamFilterOption = Readonly<{
  id: string;
  name: string;
  shortName: string | null;
  tla: string | null;
}>;

export type FixtureBrowserData = Readonly<{
  matches: readonly PublicMatchDto[];
  competitions: readonly CompetitionFilterOption[];
  teams: readonly TeamFilterOption[];
  freshness: FixtureFreshness;
  total: number;
  totalPages: number;
}>;

function safeMatchRows(rows: readonly unknown[]): readonly PublicMatchDto[] {
  try {
    return rows.map(toPublicMatchDto);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

function observedFreshness(
  updatedAt: string | null,
  coverageThrough: string | null,
  route: string,
): FixtureFreshness {
  const now = new Date();
  const freshness = deriveFixtureFreshness(updatedAt, coverageThrough, now);
  safeLog("info", "sports.catalog.observed", {
    route,
    outcome: "succeeded",
    code: freshness.status,
    syncAgeSeconds: fixtureSyncAgeSeconds(updatedAt, now) ?? undefined,
  });
  return freshness;
}

export async function getFixtureBrowserData(filters: FixtureFilters): Promise<FixtureBrowserData> {
  const supabase = createAnonymousServerClient();
  const plan = fixtureQueryPlan(filters);
  let matchQuery = supabase
    .from("public_future_matches")
    .select(PUBLIC_MATCH_SELECT, { count: "exact" })
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .range(plan.offset, plan.lastIndex);

  if (plan.startAt !== null && plan.endBefore !== null) {
    matchQuery = matchQuery.gte("starts_at", plan.startAt).lt("starts_at", plan.endBefore);
  }
  if (filters.competitionId !== undefined) {
    matchQuery = matchQuery.eq("competition_id", filters.competitionId);
  }
  if (filters.teamId !== undefined) {
    matchQuery = matchQuery.or(
      `home_team_id.eq.${filters.teamId},away_team_id.eq.${filters.teamId}`,
    );
  }

  const [matchResult, competitionResult, teamResult, freshnessResult] = await Promise.all([
    matchQuery,
    supabase
      .from("competitions")
      .select("id, name, code")
      .eq("active", true)
      .order("name")
      .limit(100),
    supabase
      .from("teams")
      .select("id, name, short_name, tla")
      .eq("active", true)
      .order("name")
      .limit(100),
    supabase.rpc("get_public_provider_freshness", { input_provider: "football-data" }),
  ]);

  let matchRows = matchResult.data ?? [];
  let total = matchResult.count ?? 0;
  if (matchResult.error !== null) {
    if (matchResult.error.code !== "PGRST103") {
      throw new DomainError("INTERNAL_ERROR", { cause: matchResult.error });
    }

    let countQuery = supabase
      .from("public_future_matches")
      .select("id", { count: "exact", head: true });
    if (plan.startAt !== null && plan.endBefore !== null) {
      countQuery = countQuery.gte("starts_at", plan.startAt).lt("starts_at", plan.endBefore);
    }
    if (filters.competitionId !== undefined) {
      countQuery = countQuery.eq("competition_id", filters.competitionId);
    }
    if (filters.teamId !== undefined) {
      countQuery = countQuery.or(
        `home_team_id.eq.${filters.teamId},away_team_id.eq.${filters.teamId}`,
      );
    }
    const countResult = await countQuery;
    if (countResult.error !== null) {
      throw new DomainError("INTERNAL_ERROR", { cause: countResult.error });
    }
    matchRows = [];
    total = countResult.count ?? 0;
  }
  if (competitionResult.error !== null || teamResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", {
      cause: competitionResult.error ?? teamResult.error,
    });
  }

  return {
    matches: safeMatchRows(matchRows),
    competitions: competitionResult.data.map((competition) => ({
      id: competition.id,
      name: competition.name,
      code: competition.code,
    })),
    teams: teamResult.data.map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      tla: team.tla,
    })),
    freshness: observedFreshness(
      freshnessResult.error === null ? (freshnessResult.data.at(0)?.updated_at ?? null) : null,
      freshnessResult.error === null
        ? (freshnessResult.data.at(0)?.coverage_through ?? null)
        : null,
      "/matches",
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / FIXTURES_PER_PAGE)),
  };
}

export async function getFixtureById(matchId: string): Promise<
  Readonly<{
    match: PublicMatchDto | null;
    freshness: FixtureFreshness;
  }>
> {
  const supabase = createAnonymousServerClient();
  const [matchResult, freshnessResult] = await Promise.all([
    supabase
      .from("public_future_matches")
      .select(PUBLIC_MATCH_SELECT)
      .eq("id", matchId)
      .maybeSingle(),
    supabase.rpc("get_public_provider_freshness", { input_provider: "football-data" }),
  ]);

  if (matchResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: matchResult.error });
  }

  return {
    match: matchResult.data === null ? null : (safeMatchRows([matchResult.data]).at(0) ?? null),
    freshness: observedFreshness(
      freshnessResult.error === null ? (freshnessResult.data.at(0)?.updated_at ?? null) : null,
      freshnessResult.error === null
        ? (freshnessResult.data.at(0)?.coverage_through ?? null)
        : null,
      "/matches/[matchId]",
    ),
  };
}
