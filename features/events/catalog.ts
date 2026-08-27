import "server-only";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const matchRowSchema = z
  .object({
    id: z.uuid(),
    competition_name: z.string(),
    home_team_name: z.string(),
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

export type PrivateEventCatalog = Readonly<{
  cities: readonly Readonly<{ id: string; name: string }>[];
  matches: readonly Readonly<{
    id: string;
    label: string;
    startsAt: string;
  }>[];
  groups: readonly Readonly<{
    id: string;
    slug: string;
    name: string;
    lifecycle: "forming" | "active";
  }>[];
  acceptedFriendCount: number;
}>;

export async function getPrivateEventCatalog(): Promise<PrivateEventCatalog> {
  const supabase = await createClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;
  if (user === null) throw new DomainError("AUTH_REQUIRED");

  const [citiesResult, matchesResult, membershipResult, friendshipResult] = await Promise.all([
    supabase.from("cities").select("id, name_en").eq("active", true).order("name_en").limit(100),
    supabase
      .from("public_future_matches")
      .select("id, competition_name, home_team_name, away_team_name, starts_at")
      .order("starts_at")
      .limit(250),
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
  ]);

  const firstError =
    citiesResult.error ?? matchesResult.error ?? membershipResult.error ?? friendshipResult.error;
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

  const matches = z.array(matchRowSchema).parse(matchesResult.data);
  const groups = z.array(groupRowSchema).parse(rawGroups);
  return {
    cities: (citiesResult.data ?? []).map((city) => ({ id: city.id, name: city.name_en })),
    matches: matches.map((match) => ({
      id: match.id,
      label: match.home_team_name + " vs " + match.away_team_name + " — " + match.competition_name,
      startsAt: match.starts_at,
    })),
    groups,
    acceptedFriendCount: friendshipResult.count ?? 0,
  };
}
