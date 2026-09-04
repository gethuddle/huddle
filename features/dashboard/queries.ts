import "server-only";

import { z } from "zod";

import { parseAttentionItems } from "@/features/attention/queries";
import type { AttentionItem } from "@/features/attention/types";
import { toPublicMatchDto, type PublicMatchDto } from "@/features/sports/dto";
import { loadTeamVisualsByName, type TeamVisual } from "@/features/sports/team-visuals";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import {
  boundedPage,
  collectionOffset,
  collectionPageCount,
  COLLECTION_PAGE_SIZE,
} from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

export const eventBuckets = ["upcoming", "hosting", "pending", "history"] as const;
export const groupBuckets = ["all", "owner", "admin", "member", "applying"] as const;
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
    place_kind: z.enum(["home", "venue", "public_place"]),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
    bucket: z.enum(eventBuckets),
    relationship_label: z.string(),
    can_manage: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const fanHomeProjectionSchema = z
  .object({
    next_event: myEventRowSchema.nullable(),
    attention: z.array(z.record(z.string(), z.unknown())),
    suggestion: z.record(z.string(), z.unknown()).nullable(),
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

const myGroupInvitationRowSchema = z
  .object({
    invitation_id: z.uuid(),
    group_id: z.uuid(),
    group_slug: z.string(),
    group_name: z.string(),
    inviter_handle: z.string(),
    invited_at: z.iso.datetime({ offset: true }),
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
  homeTeamTla: string | null;
  homeTeamCrestUrl: string | null;
  awayTeamName: string;
  awayTeamTla: string | null;
  awayTeamCrestUrl: string | null;
  competitionName: string;
  startsAt: string;
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
  tla: string | null;
  crestUrl: string | null;
  createdAt: string;
  totalCount: number;
}>;

export type MyGroupInvitation = Readonly<{
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  inviterHandle: string;
  invitedAt: string;
}>;

export type MyGroup = z.infer<typeof compatibilityGroupRowSchema>;

function parseRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

async function parseEvents(
  supabase: ServerClient,
  value: unknown,
  options: Readonly<{ includeTeamVisuals?: boolean }> = {},
): Promise<readonly MyEvent[]> {
  const rows = parseRows(myEventRowSchema, value);
  const visuals: ReadonlyMap<string, TeamVisual> =
    options.includeTeamVisuals === false
      ? new Map()
      : await loadTeamVisualsByName(
          supabase,
          rows.flatMap((row) => [row.home_team_name, row.away_team_name]),
        );
  return rows.map((row) => ({
    id: row.event_id,
    title: row.title,
    homeTeamName: row.home_team_name,
    homeTeamTla: visuals.get(row.home_team_name)?.tla ?? null,
    homeTeamCrestUrl: visuals.get(row.home_team_name)?.crestUrl ?? null,
    awayTeamName: row.away_team_name,
    awayTeamTla: visuals.get(row.away_team_name)?.tla ?? null,
    awayTeamCrestUrl: visuals.get(row.away_team_name)?.crestUrl ?? null,
    competitionName: row.competition_name,
    startsAt: row.starts_at,
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
    teamName: row.team_name,
    role: row.member_role,
    membershipStatus: row.membership_status,
    activeMemberCount: row.active_member_count,
    canManage: row.can_manage,
    totalCount: row.total_count,
  }));
}

async function parseSaved(
  supabase: ServerClient,
  value: unknown,
  options: Readonly<{ includeTeamVisuals?: boolean }> = {},
): Promise<readonly SavedItem[]> {
  const rows = parseRows(savedItemRowSchema, value);
  const visuals: ReadonlyMap<string, TeamVisual> =
    options.includeTeamVisuals === false
      ? new Map()
      : await loadTeamVisualsByName(
          supabase,
          rows.filter((row) => row.kind === "team").map((row) => row.label),
        );
  return rows.map((row) => ({
    id: row.item_id,
    kind: row.kind,
    label: row.label,
    detail: row.detail,
    href:
      (row.kind === "team" || row.kind === "competition") && row.href.startsWith("/matches?")
        ? `/discover?${row.href.slice("/matches?".length)}`
        : row.href,
    tla: row.kind === "team" ? (visuals.get(row.label)?.tla ?? null) : null,
    crestUrl: row.kind === "team" ? (visuals.get(row.label)?.crestUrl ?? null) : null,
    createdAt: row.created_at,
    totalCount: row.total_count,
  }));
}

function parseGroupInvitations(value: unknown): readonly MyGroupInvitation[] {
  return parseRows(myGroupInvitationRowSchema, value).map((row) => ({
    id: row.invitation_id,
    groupId: row.group_id,
    groupSlug: row.group_slug,
    groupName: row.group_name,
    inviterHandle: row.inviter_handle,
    invitedAt: row.invited_at,
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

type ServerClient = Awaited<ReturnType<typeof createClient>>;

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
    return parseEvents(supabase, data);
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
    return parseSaved(supabase, data);
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
    groupInvitations: readonly MyGroupInvitation[];
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
    .safeParse(options.groupBucket === undefined ? "all" : options.groupBucket);
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

  // Every RPC below independently asserts the current Fan in PostgreSQL. A
  // second Auth API + profile preflight would only duplicate those gates.
  const supabase = await createClient();
  const eventBucket = eventBucketResult.data;
  const groupBucket = groupBucketResult.data;
  const savedBucket = savedBucketResult.data;
  const [eventPage, groupPage, savedPage, invitationResult] = await Promise.all([
    loadEventPage(supabase, eventBucket, options.eventPage ?? 1),
    loadGroupPage(supabase, groupBucket, options.groupPage ?? 1),
    loadSavedPage(supabase, savedBucket, options.savedPage ?? 1),
    supabase.rpc("list_my_group_invitations"),
  ]);
  if (invitationResult.error !== null) throw domainErrorFromDatabase(invitationResult.error);

  return {
    events: eventPage.items,
    groupInvitations: parseGroupInvitations(invitationResult.data),
    groups: groupPage.items,
    saved: savedPage.items,
    pages: { events: eventPage.page, groups: groupPage.page, saved: savedPage.page },
  };
}

export async function getFanHome(displayName: string | null): Promise<
  Readonly<{
    displayName: string | null;
    nextEvent: MyEvent | null;
    attention: readonly AttentionItem[];
    suggestion: PublicMatchDto | null;
  }>
> {
  // AppShell already resolved the active Fan label. The protected Home RPC
  // remains the authoritative eligibility boundary, avoiding another Auth round trip.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_fan_home");
  if (error !== null) throw domainErrorFromDatabase(error);

  try {
    const projection = fanHomeProjectionSchema.parse(data);
    const events = await parseEvents(
      supabase,
      projection.next_event === null ? [] : [projection.next_event],
      { includeTeamVisuals: false },
    );

    return {
      displayName,
      nextEvent: events.at(0) ?? null,
      attention: parseAttentionItems(projection.attention),
      suggestion: projection.suggestion === null ? null : toPublicMatchDto(projection.suggestion),
    };
  } catch (cause) {
    if (cause instanceof DomainError) throw cause;
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
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
