// Verified against the provider's free coverage on 2026-08-25. Recheck the
// active plan before hosted scheduling; request input can never expand this list.
export const SPORTS_COMPETITION_ALLOWLIST = ["PL", "CL"] as const;

export type AllowedCompetitionCode = (typeof SPORTS_COMPETITION_ALLOWLIST)[number];
