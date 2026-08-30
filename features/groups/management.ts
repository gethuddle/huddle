import "server-only";

import { z } from "zod";

import { getGroupDetail, type GroupDetail } from "@/features/groups/detail";
import type { GroupManagementSection } from "@/features/groups/schemas";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const GROUP_MANAGEMENT_PAGE_SIZE = 20;

const applicationRowSchema = z
  .object({
    user_id: z.uuid(),
    handle: z.string(),
    display_name: z.string(),
    application_message: z.string().nullable(),
    application_source: z.enum(["discoverable", "invite"]),
    applied_at: z.string(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const memberRowSchema = z
  .object({
    user_id: z.uuid(),
    handle: z.string(),
    display_name: z.string(),
    role: z.enum(["owner", "admin", "member"]),
    member_since: z.string(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const inviteRowSchema = z
  .object({
    invite_id: z.uuid(),
    creator_handle: z.string(),
    expires_at: z.string(),
    max_uses: z.number().int().positive(),
    use_count: z.number().int().nonnegative(),
    revoked_at: z.string().nullable(),
    invite_status: z.enum(["active", "expired", "exhausted", "revoked"]),
    created_at: z.string(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const banRowSchema = z
  .object({
    user_id: z.uuid(),
    handle: z.string(),
    display_name: z.string(),
    reason: z.string(),
    banned_by_handle: z.string(),
    banned_at: z.string(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const ruleRowSchema = z
  .object({
    rule_id: z.uuid(),
    rule_position: z.number().int().positive(),
    rule_text: z.string(),
    published_at: z.string().nullable(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const eventSubmissionRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
    submitter_handle: z.string(),
    submitter_display_name: z.string(),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    audience_group_name: z.string().nullable(),
    place_kind: z.enum(["home", "venue", "public_place"]),
    home_team_name: z.string(),
    away_team_name: z.string(),
    competition_name: z.string(),
    starts_at: z.string(),
    submitted_at: z.string(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type GroupApplication = Readonly<{
  userId: string;
  handle: string;
  displayName: string;
  message: string | null;
  source: "discoverable" | "invite";
  appliedAt: string;
}>;

export type GroupAdminMember = Readonly<{
  userId: string;
  handle: string;
  displayName: string;
  role: "owner" | "admin" | "member";
  memberSince: string;
}>;

export type GroupInviteMetadata = Readonly<{
  id: string;
  creatorHandle: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  revokedAt: string | null;
  status: "active" | "expired" | "exhausted" | "revoked";
  createdAt: string;
}>;

export type GroupBan = Readonly<{
  userId: string;
  handle: string;
  displayName: string;
  reason: string;
  bannedByHandle: string;
  bannedAt: string;
}>;

export type GroupManagedRule = Readonly<{
  id: string;
  position: number;
  text: string;
  publishedAt: string | null;
}>;

export type GroupEventSubmission = Readonly<{
  id: string;
  title: string;
  status: "draft" | "pending_group_review" | "published" | "cancelled" | "completed";
  submitterHandle: string;
  submitterDisplayName: string;
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceGroupName: string | null;
  placeKind: "home" | "venue" | "public_place";
  match: Readonly<{
    homeTeamName: string;
    awayTeamName: string;
    competitionName: string;
  }>;
  startsAt: string;
  submittedAt: string;
}>;

export type GroupOverviewAttention = Readonly<{
  applications: readonly GroupApplication[];
  events: readonly GroupEventSubmission[];
}>;

type SettingsPage<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageCount: number;
  totalCount: number;
}>;

export type GroupSettings = Readonly<{
  group: GroupDetail;
  members: SettingsPage<GroupAdminMember>;
  rules: readonly GroupManagedRule[];
  bans: SettingsPage<GroupBan>;
}>;

type ManagementBase = Readonly<{
  group: GroupDetail;
  page: number;
  pageCount: number;
  totalCount: number;
}>;

export type GroupManagementResult =
  | (ManagementBase & Readonly<{ section: "events"; items: readonly GroupEventSubmission[] }>)
  | (ManagementBase & Readonly<{ section: "applications"; items: readonly GroupApplication[] }>)
  | (ManagementBase & Readonly<{ section: "members"; items: readonly GroupAdminMember[] }>)
  | (ManagementBase & Readonly<{ section: "invites"; items: readonly GroupInviteMetadata[] }>)
  | (ManagementBase & Readonly<{ section: "bans"; items: readonly GroupBan[] }>)
  | (ManagementBase & Readonly<{ section: "rules"; items: readonly GroupManagedRule[] }>);

function countResult(rows: readonly Readonly<{ total_count: number }>[]) {
  const totalCount = rows.at(0)?.total_count ?? 0;
  return {
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / GROUP_MANAGEMENT_PAGE_SIZE)),
  };
}

function parseRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

function applicationItem(row: z.infer<typeof applicationRowSchema>): GroupApplication {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    message: row.application_message,
    source: row.application_source,
    appliedAt: row.applied_at,
  };
}

function eventSubmissionItem(row: z.infer<typeof eventSubmissionRowSchema>): GroupEventSubmission {
  return {
    id: row.event_id,
    title: row.title,
    status: row.status,
    submitterHandle: row.submitter_handle,
    submitterDisplayName: row.submitter_display_name,
    audience: row.audience,
    audienceGroupName: row.audience_group_name,
    placeKind: row.place_kind,
    match: {
      homeTeamName: row.home_team_name,
      awayTeamName: row.away_team_name,
      competitionName: row.competition_name,
    },
    startsAt: row.starts_at,
    submittedAt: row.submitted_at,
  };
}

function memberItem(row: z.infer<typeof memberRowSchema>): GroupAdminMember {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    role: row.role,
    memberSince: row.member_since,
  };
}

function ruleItem(row: z.infer<typeof ruleRowSchema>): GroupManagedRule {
  return {
    id: row.rule_id,
    position: row.rule_position,
    text: row.rule_text,
    publishedAt: row.published_at,
  };
}

function banItem(row: z.infer<typeof banRowSchema>): GroupBan {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    reason: row.reason,
    bannedByHandle: row.banned_by_handle,
    bannedAt: row.banned_at,
  };
}

function settingsPage<T>(
  items: readonly T[],
  rows: readonly Readonly<{ total_count: number }>[],
  page: number,
): SettingsPage<T> {
  return { items, page, ...countResult(rows) };
}

export async function getGroupOverviewAttention(
  group: GroupDetail,
): Promise<GroupOverviewAttention> {
  if (group.viewerRole !== "owner" && group.viewerRole !== "admin") {
    return { applications: [], events: [] };
  }

  const supabase = await createClient();
  const paging = { input_group_id: group.id, input_offset: 0, input_limit: 6 };
  const [applicationResult, eventResult] = await Promise.all([
    supabase.rpc("list_group_applications", paging),
    supabase.rpc("list_group_event_submissions", paging),
  ]);
  if (applicationResult.error !== null) throw domainErrorFromDatabase(applicationResult.error);
  if (eventResult.error !== null) throw domainErrorFromDatabase(eventResult.error);

  return {
    applications: parseRows(applicationRowSchema, applicationResult.data).map(applicationItem),
    events: parseRows(eventSubmissionRowSchema, eventResult.data)
      .filter((row) => row.status === "pending_group_review")
      .map(eventSubmissionItem),
  };
}

export async function getGroupSettings(
  slug: string,
  membersPage = 1,
  bansPage = 1,
): Promise<GroupSettings | null> {
  const group = await getGroupDetail(slug);
  if (group === null || (group.viewerRole !== "owner" && group.viewerRole !== "admin")) return null;

  const safeMembersPage = Math.max(1, Math.trunc(membersPage));
  const safeBansPage = Math.max(1, Math.trunc(bansPage));
  const supabase = await createClient();
  const [memberResult, ruleResult, banResult] = await Promise.all([
    supabase.rpc("list_group_admin_members", {
      input_group_id: group.id,
      input_offset: (safeMembersPage - 1) * GROUP_MANAGEMENT_PAGE_SIZE,
      input_limit: GROUP_MANAGEMENT_PAGE_SIZE,
    }),
    supabase.rpc("list_group_rules", {
      input_group_id: group.id,
      input_offset: 0,
      input_limit: 100,
    }),
    supabase.rpc("list_group_bans", {
      input_group_id: group.id,
      input_offset: (safeBansPage - 1) * GROUP_MANAGEMENT_PAGE_SIZE,
      input_limit: GROUP_MANAGEMENT_PAGE_SIZE,
    }),
  ]);
  if (memberResult.error !== null) throw domainErrorFromDatabase(memberResult.error);
  if (ruleResult.error !== null) throw domainErrorFromDatabase(ruleResult.error);
  if (banResult.error !== null) throw domainErrorFromDatabase(banResult.error);

  const memberRows = parseRows(memberRowSchema, memberResult.data);
  const ruleRows = parseRows(ruleRowSchema, ruleResult.data);
  const banRows = parseRows(banRowSchema, banResult.data);
  if (
    (memberRows.length === 0 && safeMembersPage > 1) ||
    (banRows.length === 0 && safeBansPage > 1)
  ) {
    return getGroupSettings(
      slug,
      memberRows.length === 0 ? 1 : safeMembersPage,
      banRows.length === 0 ? 1 : safeBansPage,
    );
  }

  return {
    group,
    members: settingsPage(memberRows.map(memberItem), memberRows, safeMembersPage),
    rules: ruleRows.map(ruleItem),
    bans: settingsPage(banRows.map(banItem), banRows, safeBansPage),
  };
}

export async function getGroupManagement(
  slug: string,
  section: GroupManagementSection,
  page: number,
): Promise<GroupManagementResult | null> {
  const group = await getGroupDetail(slug);
  if (group === null || (group.viewerRole !== "owner" && group.viewerRole !== "admin")) return null;

  const supabase = await createClient();
  const paging = {
    input_group_id: group.id,
    input_offset: (page - 1) * GROUP_MANAGEMENT_PAGE_SIZE,
    input_limit: GROUP_MANAGEMENT_PAGE_SIZE,
  };

  if (section === "events") {
    const { data, error } = await supabase.rpc("list_group_event_submissions", paging);
    if (error !== null) throw domainErrorFromDatabase(error);
    const rows = parseRows(eventSubmissionRowSchema, data);
    if (rows.length === 0 && page > 1) return getGroupManagement(slug, section, 1);
    return {
      group,
      section,
      page,
      ...countResult(rows),
      items: rows.map((row) => ({
        id: row.event_id,
        title: row.title,
        status: row.status,
        submitterHandle: row.submitter_handle,
        submitterDisplayName: row.submitter_display_name,
        audience: row.audience,
        audienceGroupName: row.audience_group_name,
        placeKind: row.place_kind,
        match: {
          homeTeamName: row.home_team_name,
          awayTeamName: row.away_team_name,
          competitionName: row.competition_name,
        },
        startsAt: row.starts_at,
        submittedAt: row.submitted_at,
      })),
    };
  }

  if (section === "applications") {
    const { data, error } = await supabase.rpc("list_group_applications", paging);
    if (error !== null) throw domainErrorFromDatabase(error);
    const rows = parseRows(applicationRowSchema, data);
    if (rows.length === 0 && page > 1) return getGroupManagement(slug, section, 1);
    return {
      group,
      section,
      page,
      ...countResult(rows),
      items: rows.map((row) => ({
        userId: row.user_id,
        handle: row.handle,
        displayName: row.display_name,
        message: row.application_message,
        source: row.application_source,
        appliedAt: row.applied_at,
      })),
    };
  }

  if (section === "members") {
    const { data, error } = await supabase.rpc("list_group_admin_members", paging);
    if (error !== null) throw domainErrorFromDatabase(error);
    const rows = parseRows(memberRowSchema, data);
    if (rows.length === 0 && page > 1) return getGroupManagement(slug, section, 1);
    return {
      group,
      section,
      page,
      ...countResult(rows),
      items: rows.map((row) => ({
        userId: row.user_id,
        handle: row.handle,
        displayName: row.display_name,
        role: row.role,
        memberSince: row.member_since,
      })),
    };
  }

  if (section === "invites") {
    const { data, error } = await supabase.rpc("list_group_invites", paging);
    if (error !== null) throw domainErrorFromDatabase(error);
    const rows = parseRows(inviteRowSchema, data);
    if (rows.length === 0 && page > 1) return getGroupManagement(slug, section, 1);
    return {
      group,
      section,
      page,
      ...countResult(rows),
      items: rows.map((row) => ({
        id: row.invite_id,
        creatorHandle: row.creator_handle,
        expiresAt: row.expires_at,
        maxUses: row.max_uses,
        useCount: row.use_count,
        revokedAt: row.revoked_at,
        status: row.invite_status,
        createdAt: row.created_at,
      })),
    };
  }

  if (section === "bans") {
    const { data, error } = await supabase.rpc("list_group_bans", paging);
    if (error !== null) throw domainErrorFromDatabase(error);
    const rows = parseRows(banRowSchema, data);
    if (rows.length === 0 && page > 1) return getGroupManagement(slug, section, 1);
    return {
      group,
      section,
      page,
      ...countResult(rows),
      items: rows.map((row) => ({
        userId: row.user_id,
        handle: row.handle,
        displayName: row.display_name,
        reason: row.reason,
        bannedByHandle: row.banned_by_handle,
        bannedAt: row.banned_at,
      })),
    };
  }

  const { data, error } = await supabase.rpc("list_group_rules", {
    input_group_id: group.id,
    input_offset: 0,
    input_limit: 100,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  const rows = parseRows(ruleRowSchema, data);
  return {
    group,
    section,
    page: 1,
    ...countResult(rows),
    pageCount: 1,
    items: rows.map((row) => ({
      id: row.rule_id,
      position: row.rule_position,
      text: row.rule_text,
      publishedAt: row.published_at,
    })),
  };
}
