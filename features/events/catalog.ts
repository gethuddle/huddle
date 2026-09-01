import "server-only";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const matchRowSchema = z
  .object({
    id: z.uuid(),
    sport_slug: z.string(),
    competition_id: z.uuid(),
    competition_name: z.string(),
    home_team_id: z.uuid(),
    home_team_name: z.string(),
    away_team_id: z.uuid(),
    away_team_name: z.string(),
    starts_at: z.string(),
  })
  .strict();

const groupRowSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    lifecycle: z.enum(["forming", "active"]),
  })
  .strict();

const venueMatchRowSchema = z
  .object({
    id: z.uuid(),
    sport_slug: z.string(),
    competition_id: z.uuid(),
    competition_name: z.string(),
    home_team_id: z.uuid(),
    home_team_name: z.string(),
    away_team_id: z.uuid(),
    away_team_name: z.string(),
    starts_at: z.string(),
  })
  .strict();

export type PrivateEventCatalog = Readonly<{
  matches: readonly Readonly<{
    id: string;
    label: string;
    startsAt: string;
    followed: boolean;
    sportSlug?: string;
    sportName?: string;
    competitionName?: string;
  }>[];
  matchesHasMore?: boolean;
  groups: readonly Readonly<{
    id: string;
    slug: string;
    name: string;
    lifecycle: "forming" | "active";
  }>[];
  acceptedFriendCount: number;
}>;

export type VenueEventCatalog = Readonly<{
  matches: readonly Readonly<{
    id: string;
    label: string;
    startsAt: string;
    sportSlug?: string;
    sportName?: string;
    competitionName?: string;
  }>[];
  matchesHasMore?: boolean;
  teams: readonly Readonly<{
    id: string;
    name: string;
  }>[];
}>;

export async function getPrivateEventCatalog(
  selectedMatchId?: string,
): Promise<PrivateEventCatalog> {
  const supabase = await createClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;
  if (user === null) throw new DomainError("AUTH_REQUIRED");

  const [
    matchesResult,
    selectedMatchResult,
    membershipResult,
    friendshipResult,
    subscriptionResult,
  ] = await Promise.all([
    supabase
      .from("public_future_matches")
      .select(
        "id, sport_slug, competition_id, competition_name, home_team_id, home_team_name, away_team_id, away_team_name, starts_at",
      )
      .order("starts_at")
      .order("id")
      .limit(51),
    selectedMatchId === undefined
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("public_future_matches")
          .select(
            "id, sport_slug, competition_id, competition_name, home_team_id, home_team_name, away_team_id, away_team_name, starts_at",
          )
          .eq("id", selectedMatchId)
          .maybeSingle(),
    supabase
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(100),
    supabase
      .from("friendships")
      .select("user_low_id", { count: "exact", head: true })
      .eq("status", "accepted"),
    supabase
      .from("subscriptions")
      .select("competition_id, team_id")
      .eq("user_id", user.id)
      .limit(500),
  ]);

  const firstError =
    matchesResult.error ??
    selectedMatchResult.error ??
    membershipResult.error ??
    friendshipResult.error ??
    subscriptionResult.error;
  if (firstError !== null) throw new DomainError("INTERNAL_ERROR", { cause: firstError });

  const groupIds = (membershipResult.data ?? []).map((membership) => membership.group_id);
  let rawGroups: unknown[] = [];
  if (groupIds.length > 0) {
    const groupResult = await supabase
      .from("groups")
      .select("id, slug, name, lifecycle")
      .in("id", groupIds)
      .in("lifecycle", ["forming", "active"])
      .order("name");
    if (groupResult.error !== null) {
      throw new DomainError("INTERNAL_ERROR", { cause: groupResult.error });
    }
    rawGroups = groupResult.data;
  }

  const initialMatches = z.array(matchRowSchema).parse(matchesResult.data);
  const selectedMatch =
    selectedMatchResult.data === null ? null : matchRowSchema.parse(selectedMatchResult.data);
  const matches = initialMatches.slice(0, 50);
  if (selectedMatch !== null && !matches.some((match) => match.id === selectedMatch.id)) {
    matches.push(selectedMatch);
  }
  const groups = z.array(groupRowSchema).parse(rawGroups);
  const followedIds = new Set(
    (subscriptionResult.data ?? []).flatMap((subscription) =>
      [subscription.competition_id, subscription.team_id].filter(
        (value): value is string => value !== null,
      ),
    ),
  );
  return {
    matches: matches.map((match) => ({
      id: match.id,
      label: match.home_team_name + " vs " + match.away_team_name + " — " + match.competition_name,
      startsAt: match.starts_at,
      sportSlug: match.sport_slug,
      sportName: match.sport_slug
        .replaceAll("-", " ")
        .replace(/^./u, (letter) => letter.toUpperCase()),
      competitionName: match.competition_name,
      followed:
        followedIds.has(match.competition_id) ||
        followedIds.has(match.home_team_id) ||
        followedIds.has(match.away_team_id),
    })),
    matchesHasMore: initialMatches.length > 50,
    groups,
    acceptedFriendCount: friendshipResult.count ?? 0,
  };
}

export async function getVenueEventCatalog(selectedMatchId?: string): Promise<VenueEventCatalog> {
  const supabase = await createClient();
  const [matchResult, selectedMatchResult] = await Promise.all([
    supabase
      .from("public_future_matches")
      .select(
        "id, sport_slug, competition_id, competition_name, home_team_id, home_team_name, away_team_id, away_team_name, starts_at",
      )
      .order("starts_at")
      .order("id")
      .limit(51),
    selectedMatchId === undefined
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("public_future_matches")
          .select(
            "id, sport_slug, competition_id, competition_name, home_team_id, home_team_name, away_team_id, away_team_name, starts_at",
          )
          .eq("id", selectedMatchId)
          .maybeSingle(),
  ]);
  const firstError = matchResult.error ?? selectedMatchResult.error;
  if (firstError !== null) throw new DomainError("INTERNAL_ERROR", { cause: firstError });

  let matches: z.infer<typeof venueMatchRowSchema>[];
  try {
    const initialMatches = z.array(venueMatchRowSchema).parse(matchResult.data);
    matches = initialMatches.slice(0, 50);
    if (selectedMatchResult.data !== null) {
      const selectedMatch = venueMatchRowSchema.parse(selectedMatchResult.data);
      if (!matches.some((match) => match.id === selectedMatch.id)) matches.push(selectedMatch);
    }
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const teams = new Map<string, string>();
  for (const match of matches) {
    teams.set(match.home_team_id, match.home_team_name);
    teams.set(match.away_team_id, match.away_team_name);
  }

  return {
    matches: matches.map((match) => ({
      id: match.id,
      label: match.home_team_name + " vs " + match.away_team_name + " — " + match.competition_name,
      startsAt: match.starts_at,
      sportSlug: match.sport_slug,
      sportName: match.sport_slug
        .replaceAll("-", " ")
        .replace(/^./u, (letter) => letter.toUpperCase()),
      competitionName: match.competition_name,
    })),
    matchesHasMore: (matchResult.data?.length ?? 0) > 50,
    teams: [...teams.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((first, second) => first.name.localeCompare(second.name)),
  };
}
