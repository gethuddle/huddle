export type DateRange = Readonly<{
  from: string;
  to: string;
}>;

export type NormalizedMatchStatus = "scheduled" | "timed" | "postponed" | "cancelled" | "finished";

export type NormalizedCompetition = Readonly<{
  provider: string;
  providerExternalId: string;
  code: string | null;
  name: string;
  countryName: string | null;
}>;

export type NormalizedTeam = Readonly<{
  provider: string;
  providerExternalId: string;
  name: string;
  shortName: string | null;
  tla: string | null;
  countryName: string | null;
}>;

export type NormalizedFixture = Readonly<{
  provider: string;
  providerExternalId: string;
  competition: NormalizedCompetition;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  startsAt: string;
  status: NormalizedMatchStatus;
  matchday: number | null;
  stage: string | null;
  seasonLabel: string | null;
}>;

export interface SportsProvider {
  readonly name: string;
  listCompetitions(): Promise<NormalizedCompetition[]>;
  listFixtures(
    dateRange: DateRange,
    competitionExternalIds: string[],
  ): Promise<NormalizedFixture[]>;
}

export type ProviderRequestMetadata = Readonly<{
  requestCount: number;
  retryCount: number;
}>;
