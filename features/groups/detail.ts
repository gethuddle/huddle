import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

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
    can_view_member_content: z.boolean(),
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
  canViewMemberContent: boolean;
  members: readonly Readonly<{
    handle: string;
    displayName: string;
    role: "owner" | "admin" | "member";
    memberSince: string;
  }>[];
}>;

export async function getGroupDetail(slug: string): Promise<GroupDetail | null> {
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

  let members: GroupDetail["members"] = [];
  if (row.can_view_member_content) {
    const rosterResult = await supabase.rpc("list_safe_group_members", {
      input_group_id: row.group_id,
      input_offset: 0,
      input_limit: 20,
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
    canViewMemberContent: row.can_view_member_content,
    members,
  };
}
