import "server-only";

import { z } from "zod";

import { parseAttentionItems } from "@/features/attention/queries";
import type { AttentionItem } from "@/features/attention/types";
import { requireActor } from "@/features/auth/actor";
import { toPublicMatchDto, type PublicMatchDto } from "@/features/sports/dto";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import {
  boundedPage,
  collectionOffset,
  collectionPageCount,
  COLLECTION_PAGE_SIZE,
} from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

export const eventBuckets = ["upcoming", "hosting", "pending", "history"] as const;
export const groupBuckets = ["owner", "admin", "member", "applying"] as const;
export const savedBuckets = ["all", "sport", "competition", "team", "venue"] as const;

export type EventBucket = (typeof eventBuckets)[number];
export type GroupBucket = (typeof groupBuckets)[number];
export type SavedBucket = (typeof savedBuckets)[number];

const myEventRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    home_team_name: z.string(),
    away_team_name: z.string(),
    competition_name: z.string(),
    starts_at: z.iso.datetime({ offset: true }),
    city_name: z.string(),
    place_kind: z.enum(["home", "venue", "public_place"]),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
    bucket: z.enum(eventBuckets),
    relationship_label: z.string(),
    can_manage: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const myGroupRelationshipRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(["discoverable", "unlisted"]),
    lifecycle: z.enum(["forming", "active", "suspended", "archived"]),
    city_name: z.string(),
    team_name: z.string().nullable(),
    member_role: z.enum(["owner", "admin", "member"]).nullable(),
    membership_status: z.enum(["pending", "active"]),
    active_member_count: z.number().int().nonnegative().nullable(),
    can_manage: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const savedItemRowSchema = z
  .object({
    item_id: z.uuid(),
    kind: z.enum(["sport", "competition", "team", "venue"]),
    label: z.string(),
    detail: z.string().nullable(),
    href: z.string().startsWith("/"),
    created_at: z.iso.datetime({ offset: true }),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const compatibilityGroupRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(["discoverable", "unlisted"]),
    lifecycle: z.enum(["forming", "active", "suspended", "archived"]),
    city_name: z.string(),
    team_name: z.string().nullable(),
    member_role: z.enum(["owner", "admin", "member"]),
    membership_status: z.literal("active"),
    active_member_count: z.number().int().nonnegative(),
    can_manage: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type MyEvent = Readonly<{
  id: string;
  title: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionName: string;
  startsAt: string;
  cityName: string;
  placeKind: "home" | "venue" | "public_place";
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  status: "draft" | "pending_group_review" | "published" | "cancelled" | "completed";
  bucket: EventBucket;
  relationshipLabel: string;
  canManage: boolean;
  totalCount: number;
}>;

export type MyGroupRelationship = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: "discoverable" | "unlisted";
  lifecycle: "forming" | "active" | "suspended" | "archived";
  cityName: string;
  teamName: string | null;
  role: "owner" | "admin" | "member" | null;
  membershipStatus: "pending" | "active";
  activeMemberCount: number | null;
  canManage: boolean;
  totalCount: number;
}>;

export type SavedItem = Readonly<{
  id: string;
  kind: "sport" | "competition" | "team" | "venue";
  label: string;
  detail: string | null;
  href: string;
  createdAt: string;
  totalCount: number;
}>;

export type MyGroup = z.infer<typeof compatibilityGroupRowSchema>;

function parseRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

function parseEvents(value: unknown): readonly MyEvent[] {
  return parseRows(myEventRowSchema, value).map((row) => ({
    id: row.event_id,
    title: row.title,
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    competitionName: row.competition_name,
    startsAt: row.starts_at,
    cityName: row.city_name,
    placeKind: row.place_kind,
    audience: row.audience,
    status: row.status,
    bucket: row.bucket,
    relationshipLabel: row.relationship_label,
    canManage: row.can_manage,
    totalCount: row.total_count,
  }));
}

function parseGroups(value: unknown): readonly MyGroupRelationship[] {
  return parseRows(myGroupRelationshipRowSchema, value).map((row) => ({
    id: row.group_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    lifecycle: row.lifecycle,
    cityName: row.city_name,
    teamName: row.team_name,
    role: row.member_role,
    membershipStatus: row.membership_status,
    activeMemberCount: row.active_member_count,
    canManage: row.can_manage,
    totalCount: row.total_count,
  }));
}

function parseSaved(value: unknown): readonly SavedItem[] {
  return parseRows(savedItemRowSchema, value).map((row) => ({
    id: row.item_id,
    kind: row.kind,
    label: row.label,
    detail: row.detail,
    href: row.href,
    createdAt: row.created_at,
    totalCount: row.total_count,
  }));
}

type CountedPageItem = Readonly<{ totalCount: number }>;

async function canonicalizeRpcPage<T extends CountedPageItem>(
  requestedPage: number,
  initialItems: readonly T[],
  requestPage: (page: number) => Promise<readonly T[]>,
): Promise<Readonly<{ items: readonly T[]; page: number }>> {
  if (requestedPage === 1 || initialItems.length > 0) {
    return { items: initialItems, page: requestedPage };
  }

  const firstItems = await requestPage(1);
  const finalPage = collectionPageCount(firstItems.at(0)?.totalCount ?? 0);
  if (finalPage === 1) return { items: firstItems, page: 1 };

  return { items: await requestPage(finalPage), page: finalPage };
}

type ServerClient = Awaited<ReturnType<typeof requireActor>>["supabase"];

async function loadEventPage(
  supabase: ServerClient,
  bucket: EventBucket,
  rawPage: number,
): Promise<Readonly<{ items: readonly MyEvent[]; page: number }>> {
  const page = boundedPage(rawPage);
  const requestPage = async (targetPage: number) => {
    const { data, error } = await supabase.rpc("list_my_events", {
      input_bucket: bucket,
      input_limit: COLLECTION_PAGE_SIZE,
      input_offset: collectionOffset(targetPage),
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    return parseEvents(data);
  };
  return canonicalizeRpcPage(page, await requestPage(page), requestPage);
}

async function loadGroupPage(
  supabase: ServerClient,
  bucket: GroupBucket,
  rawPage: number,
): Promise<Readonly<{ items: readonly MyGroupRelationship[]; page: number }>> {
  const page = boundedPage(rawPage);
  const requestPage = async (targetPage: number) => {
    const { data, error } = await supabase.rpc("list_my_group_relationships", {
      input_bucket: bucket,
      input_limit: COLLECTION_PAGE_SIZE,
      input_offset: collectionOffset(targetPage),
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    return parseGroups(data);
  };
  return canonicalizeRpcPage(page, await requestPage(page), requestPage);
}

async function loadSavedPage(
  supabase: ServerClient,
  bucket: SavedBucket,
  rawPage: number,
): Promise<Readonly<{ items: readonly SavedItem[]; page: number }>> {
  const page = boundedPage(rawPage);
  const requestPage = async (targetPage: number) => {
    const { data, error } = await supabase.rpc("list_my_saved_items", {
      input_bucket: bucket,
      input_limit: COLLECTION_PAGE_SIZE,
      input_offset: collectionOffset(targetPage),
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    return parseSaved(data);
  };
  return canonicalizeRpcPage(page, await requestPage(page), requestPage);
}

export async function getMyHuddleOverview(
  options: Readonly<{
    eventBucket?: EventBucket;
    eventPage?: number;
    groupBucket?: GroupBucket;
    groupPage?: number;
    savedBucket?: SavedBucket;
    savedPage?: number;
  }> = {},
): Promise<
  Readonly<{
    events: readonly MyEvent[];
    groups: readonly MyGroupRelationship[];
    saved: readonly SavedItem[];
    pages: Readonly<{ events: number; groups: number; saved: number }>;
  }>
> {
  const eventBucketResult = z
    .enum(eventBuckets)
    .safeParse(options.eventBucket === undefined ? "upcoming" : options.eventBucket);
  const groupBucketResult = z
    .enum(groupBuckets)
    .safeParse(options.groupBucket === undefined ? "owner" : options.groupBucket);
  const savedBucketResult = z
    .enum(savedBuckets)
    .safeParse(options.savedBucket === undefined ? "all" : options.savedBucket);
  if (!eventBucketResult.success) {
    throw new DomainError("VALIDATION_FAILED", { cause: eventBucketResult.error });
  }
  if (!groupBucketResult.success) {
    throw new DomainError("VALIDATION_FAILED", { cause: groupBucketResult.error });
  }
  if (!savedBucketResult.success) {
    throw new DomainError("VALIDATION_FAILED", { cause: savedBucketResult.error });
  }

  const { supabase } = await requireActor("fan");
  const eventBucket = eventBucketResult.data;
  const groupBucket = groupBucketResult.data;
  const savedBucket = savedBucketResult.data;
  const [eventPage, groupPage, savedPage] = await Promise.all([
    loadEventPage(supabase, eventBucket, options.eventPage ?? 1),
    loadGroupPage(supabase, groupBucket, options.groupPage ?? 1),
    loadSavedPage(supabase, savedBucket, options.savedPage ?? 1),
  ]);

  return {
    events: eventPage.items,
    groups: groupPage.items,
    saved: savedPage.items,
    pages: { events: eventPage.page, groups: groupPage.page, saved: savedPage.page },
  };
}

const PUBLIC_MATCH_SELECT =
  "id, sport_id, sport_slug, competition_id, competition_code, competition_name, home_team_id, home_team_name, home_team_short_name, home_team_tla, away_team_id, away_team_name, away_team_short_name, away_team_tla, starts_at, status, matchday, stage, season_label, last_synced_at";

async function getHomeFixtureSuggestion(
  supabase: Awaited<ReturnType<typeof requireActor>>["supabase"],
  teamFollows: readonly SavedItem[],
  competitionFollows: readonly SavedItem[],
): Promise<PublicMatchDto | null> {
  const teamIds = teamFollows.filter((item) => item.kind === "team").map((item) => item.id);
  const competitionIds = competitionFollows
    .filter((item) => item.kind === "competition")
    .map((item) => item.id);
  if (teamIds.length === 0 && competitionIds.length === 0) return null;

  const filters = [
    teamIds.length > 0 ? `home_team_id.in.(${teamIds.join(",")})` : null,
    teamIds.length > 0 ? `away_team_id.in.(${teamIds.join(",")})` : null,
    competitionIds.length > 0 ? `competition_id.in.(${competitionIds.join(",")})` : null,
  ].filter((filter): filter is string => filter !== null);

  const query = supabase
    .from("public_future_matches")
    .select(PUBLIC_MATCH_SELECT)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .or(filters.join(","));
  const { data, error } = await query.limit(1);
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });
  if (data.length === 0) return null;
  try {
    return toPublicMatchDto(data[0]);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function getFanHome(): Promise<
  Readonly<{
    nextEvent: MyEvent | null;
    attention: readonly AttentionItem[];
    suggestion: PublicMatchDto | null;
  }>
> {
  const { supabase } = await requireActor("fan");
  const [upcomingResult, attentionResult, teamsResult, competitionsResult] = await Promise.all([
    supabase.rpc("list_my_events", {
      input_bucket: "upcoming",
      input_limit: 1,
      input_offset: 0,
    }),
    supabase.rpc("list_attention_items", { input_limit: 5 }),
    supabase.rpc("list_my_saved_items", {
      input_bucket: "team",
      input_limit: 50,
      input_offset: 0,
    }),
    supabase.rpc("list_my_saved_items", {
      input_bucket: "competition",
      input_limit: 50,
      input_offset: 0,
    }),
  ]);
  const firstError =
    upcomingResult.error ?? attentionResult.error ?? teamsResult.error ?? competitionsResult.error;
  if (firstError !== null) throw domainErrorFromDatabase(firstError);

  const events = parseEvents(upcomingResult.data);
  const teamFollows = parseSaved(teamsResult.data);
  const competitionFollows = parseSaved(competitionsResult.data);

  return {
    nextEvent: events.at(0) ?? null,
    attention: parseAttentionItems(attentionResult.data),
    suggestion: await getHomeFixtureSuggestion(supabase, teamFollows, competitionFollows),
  };
}

export async function listMyGroupsForViewer(limit = 6): Promise<readonly MyGroup[]> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user === null) return [];

  const profileResult = await supabase
    .from("profiles")
    .select("profile_completed_at")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: profileResult.error });
  }
  if (profileResult.data?.profile_completed_at === null || profileResult.data === null) return [];

  const result = await supabase.rpc("list_my_groups", {
    input_limit: Math.min(Math.max(limit, 1), 20),
    input_offset: 0,
  });
  if (result.error !== null) {
    const error = domainErrorFromDatabase(result.error);
    if (error.code !== "INTERNAL_ERROR") return [];
    throw error;
  }
  return parseRows(compatibilityGroupRowSchema, result.data);
}
