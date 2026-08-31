import { describe, expect, it } from "vitest";

import { toPublicMatchDto } from "./dto";

const row = {
  id: "10000000-0000-4000-8000-000000000001",
  sport_id: "10000000-0000-4000-8000-000000000002",
  sport_slug: "football",
  competition_id: "10000000-0000-4000-8000-000000000003",
  competition_code: "PL",
  competition_name: "Premier League",
  home_team_id: "10000000-0000-4000-8000-000000000004",
  home_team_name: "Arsenal FC",
  home_team_short_name: "Arsenal",
  home_team_tla: "ARS",
  home_team_crest_url: "https://crests.football-data.org/57.png",
  away_team_id: "10000000-0000-4000-8000-000000000005",
  away_team_name: "Chelsea FC",
  away_team_short_name: "Chelsea",
  away_team_tla: "CHE",
  away_team_crest_url: "https://crests.football-data.org/61.png",
  starts_at: "2026-08-26T17:30:00Z",
  status: "timed",
  matchday: 2,
  stage: "REGULAR_SEASON",
  season_label: "2026",
  last_synced_at: "2026-08-26T10:00:00Z",
};

describe("public match DTO", () => {
  it("maps the reviewed database projection into provider-neutral data", () => {
    expect(toPublicMatchDto(row)).toMatchObject({
      id: row.id,
      competition: { id: row.competition_id, code: "PL", name: "Premier League" },
      homeTeam: {
        id: row.home_team_id,
        name: "Arsenal FC",
        tla: "ARS",
        crestUrl: row.home_team_crest_url,
      },
      awayTeam: {
        id: row.away_team_id,
        name: "Chelsea FC",
        tla: "CHE",
        crestUrl: row.away_team_crest_url,
      },
      status: "timed",
    });
  });

  it("rejects nullable or unreviewed public projection data", () => {
    expect(() => toPublicMatchDto({ ...row, home_team_name: null })).toThrow();
    expect(() => toPublicMatchDto({ ...row, provider_token: "secret" })).toThrow();
  });
});
