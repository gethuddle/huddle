import type { FixtureFilters } from "./browse-schemas";
import { jerusalemDayUtcBounds } from "./time";

export const FIXTURES_PER_PAGE = 12;

export type FixtureQueryPlan = Readonly<{
  offset: number;
  lastIndex: number;
  startAt: string | null;
  endBefore: string | null;
}>;

export function fixtureQueryPlan(filters: FixtureFilters): FixtureQueryPlan {
  const offset = (filters.page - 1) * FIXTURES_PER_PAGE;
  const bounds = filters.date === undefined ? null : jerusalemDayUtcBounds(filters.date);

  return {
    offset,
    lastIndex: offset + FIXTURES_PER_PAGE - 1,
    startAt: bounds?.start ?? null,
    endBefore: bounds?.end ?? null,
  };
}

export function fixturePageHref(filters: FixtureFilters, page: number): string {
  const search = new URLSearchParams();
  if (filters.date !== undefined) search.set("date", filters.date);
  if (filters.competitionId !== undefined) search.set("competition", filters.competitionId);
  if (filters.teamId !== undefined) search.set("team", filters.teamId);
  if (page > 1) search.set("page", String(page));

  const query = search.toString();
  return query.length === 0 ? "/matches" : `/matches?${query}`;
}
