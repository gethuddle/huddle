import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const GROUP_MEMBER_PAGE_SIZE = 20;

const groupDetailRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(["discoverable", "unlisted"]),
    lifecycle: z.enum(["forming", "active", "suspended", "archived"]),
    city_name: z.string(),
    team_name: z.string().nullable(),
    owner_handle: z.string(),
    active_member_count: z.number().int().nonnegative(),
    viewer_role: z.enum(["owner", "admin", "member"]).nullable(),
    viewer_membership_status: z
      .enum(["pending", "active", "rejected", "left", "banned"])
      .nullable(),
    can_view_member_content: z.boolean(),
    can_apply: z.boolean(),
  })
  .strict();

const groupRuleRowSchema = z
  .object({
    rule_id: z.uuid(),
    rule_position: z.number().int().positive(),
    rule_text: z.string(),
    published_at: z.string().nullable(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const groupMemberRowSchema = z
  .object({
    handle: z.string(),
    display_name: z.string(),
    role: z.enum(["owner", "admin", "member"]),
    member_since: z.string(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type GroupDetail = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: "discoverable" | "unlisted";
  lifecycle: "forming" | "active" | "suspended" | "archived";
  cityName: string;
  teamName: string | null;
  ownerHandle: string;
  activeMemberCount: number;
  viewerRole: "owner" | "admin" | "member" | null;
  viewerMembershipStatus: "pending" | "active" | "rejected" | "left" | "banned" | null;
  canViewMemberContent: boolean;
  canApply: boolean;
  memberPage: number;
  memberPageCount: number;
  members: readonly Readonly<{
    handle: string;
    displayName: string;
    role: "owner" | "admin" | "member";
    memberSince: string;
  }>[];
  rules: readonly Readonly<{
    id: string;
    position: number;
    text: string;
    publishedAt: string | null;
  }>[];
}>;

export async function getGroupDetail(slug: string, memberPage = 1): Promise<GroupDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_group_by_slug", { lookup_slug: slug });
  if (error !== null) throw domainErrorFromDatabase(error);

  const raw = data.at(0);
  if (raw === undefined) return null;

  let row;
  try {
    row = groupDetailRowSchema.parse(raw);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const memberPageCount = row.can_view_member_content
    ? Math.max(1, Math.ceil(row.active_member_count / GROUP_MEMBER_PAGE_SIZE))
    : 1;
  const resolvedMemberPage = Math.min(Math.max(memberPage, 1), memberPageCount);

  let members: GroupDetail["members"] = [];
  if (row.can_view_member_content) {
    const rosterResult = await supabase.rpc("list_safe_group_members", {
      input_group_id: row.group_id,
      input_offset: (resolvedMemberPage - 1) * GROUP_MEMBER_PAGE_SIZE,
      input_limit: GROUP_MEMBER_PAGE_SIZE,
    });
    if (rosterResult.error !== null) throw domainErrorFromDatabase(rosterResult.error);

    try {
      members = z
        .array(groupMemberRowSchema)
        .parse(rosterResult.data)
        .map((member) => ({
          handle: member.handle,
          displayName: member.display_name,
          role: member.role,
          memberSince: member.member_since,
        }));
    } catch (cause) {
      throw new DomainError("INTERNAL_ERROR", { cause });
    }
  }

  const rulesResult = await supabase.rpc("list_group_rules", {
    input_group_id: row.group_id,
    input_offset: 0,
    input_limit: 100,
  });
  if (rulesResult.error !== null) throw domainErrorFromDatabase(rulesResult.error);

  let rules: GroupDetail["rules"];
  try {
    rules = z
      .array(groupRuleRowSchema)
      .parse(rulesResult.data)
      .map((rule) => ({
        id: rule.rule_id,
        position: rule.rule_position,
        text: rule.rule_text,
        publishedAt: rule.published_at,
      }));
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  return {
    id: row.group_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    lifecycle: row.lifecycle,
    cityName: row.city_name,
    teamName: row.team_name,
    ownerHandle: row.owner_handle,
    activeMemberCount: row.active_member_count,
    viewerRole: row.viewer_role,
    viewerMembershipStatus: row.viewer_membership_status,
    canViewMemberContent: row.can_view_member_content,
    canApply: row.can_apply,
    memberPage: resolvedMemberPage,
    memberPageCount,
    members,
    rules,
  };
}
