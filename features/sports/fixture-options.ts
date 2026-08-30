import "server-only";

import { z } from "zod";

import {
  fixtureOptionSearchParamsSchema,
  type FixtureOptionPage,
  type FixtureOptionSearchParams,
} from "@/features/sports/fixture-option-schemas";
import { israelDayUtcBounds } from "@/features/sports/time";
import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";

export const FIXTURE_OPTION_PAGE_SIZE = 50;

const rowSchema = z
  .object({
    id: z.uuid(),
    sport_slug: z.string(),
    competition_name: z.string(),
    home_team_name: z.string(),
    away_team_name: z.string(),
    starts_at: z.string(),
  })
  .strict();

export async function searchFutureMatchOptions(
  rawInput: FixtureOptionSearchParams,
): Promise<FixtureOptionPage> {
  const input = fixtureOptionSearchParamsSchema.parse(rawInput);
  const supabase = createAnonymousServerClient();
  const offset = (input.page - 1) * FIXTURE_OPTION_PAGE_SIZE;
  let query = supabase
    .from("public_future_matches")
    .select("id, sport_slug, competition_name, home_team_name, away_team_name, starts_at", {
      count: "exact",
    })
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + FIXTURE_OPTION_PAGE_SIZE - 1);

  if (input.q !== "") {
    const pattern = `%${input.q}%`;
    query = query.or(
      `home_team_name.ilike.${pattern},away_team_name.ilike.${pattern},competition_name.ilike.${pattern}`,
    );
  }
  if (input.date !== "") {
    const bounds = israelDayUtcBounds(input.date);
    query = query.gte("starts_at", bounds.start).lt("starts_at", bounds.end);
  } else if (input.from !== "" && input.to !== "") {
    query = query
      .gte("starts_at", israelDayUtcBounds(input.from).start)
      .lt("starts_at", israelDayUtcBounds(input.to).end);
  }
  if (input.sport !== "") query = query.eq("sport_slug", input.sport);
  if (input.competition !== "") {
    query = query.eq("competition_name", input.competition);
  }

  const result = await query;
  if (result.error !== null) throw new DomainError("INTERNAL_ERROR", { cause: result.error });

  try {
    const rows = z.array(rowSchema).parse(result.data);
    return {
      items: rows.map((row) => ({
        id: row.id,
        label: `${row.home_team_name} vs ${row.away_team_name} — ${row.competition_name}`,
        startsAt: row.starts_at,
        sportSlug: row.sport_slug,
        sportName: row.sport_slug
          .replaceAll("-", " ")
          .replace(/^./u, (letter) => letter.toUpperCase()),
        competitionName: row.competition_name,
      })),
      page: input.page,
      hasMore: offset + rows.length < (result.count ?? 0),
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}
