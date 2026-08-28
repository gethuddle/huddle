import "server-only";

import { z } from "zod";

import {
  appealStatusFilterSchema,
  moderationActionKinds,
  moderationPageSchema,
  moderationTargetTypes,
  reportCategories,
  reportStatusFilterSchema,
} from "@/features/moderation/schemas";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

const myReportSchema = z
  .object({
    report_id: z.uuid(),
    target_type: z.enum(moderationTargetTypes),
    target_label: z.string(),
    category: z.enum(reportCategories),
    safe_status: z.enum(["received", "reviewing", "closed"]),
    created_at: z.string(),
  })
  .strict();

const moderationReportSchema = z
  .object({
    report_id: z.uuid(),
    reporter_handle: z.string(),
    target_type: z.enum(moderationTargetTypes),
    target_id: z.uuid(),
    target_label: z.string(),
    category: z.enum(reportCategories),
    details: z.string(),
    status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
    assigned_to_me: z.boolean(),
    created_at: z.string(),
  })
  .strict();

const myModerationActionSchema = z
  .object({
    moderation_action_id: z.uuid(),
    target_type: z.enum(moderationTargetTypes),
    target_label: z.string(),
    action: z.enum(moderationActionKinds),
    reason: z.string(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    reversed_at: z.string().nullable(),
    reversal_reason: z.string().nullable(),
    has_active_appeal: z.boolean(),
  })
  .strict();

const myAppealSchema = z
  .object({
    appeal_id: z.uuid(),
    moderation_action_id: z.uuid(),
    action: z.enum(moderationActionKinds),
    reason: z.string(),
    status: z.enum(["open", "reviewing", "upheld", "modified", "reversed"]),
    outcome_reason: z.string().nullable(),
    created_at: z.string(),
    reviewed_at: z.string().nullable(),
  })
  .strict();

const moderationAppealSchema = z
  .object({
    appeal_id: z.uuid(),
    moderation_action_id: z.uuid(),
    appellant_handle: z.string(),
    action: z.enum(moderationActionKinds),
    appeal_reason: z.string(),
    status: z.enum(["open", "reviewing", "upheld", "modified", "reversed"]),
    original_moderator_id: z.uuid(),
    can_current_moderator_review: z.boolean(),
    created_at: z.string(),
  })
  .strict();

const platformModerationActionSchema = z
  .object({
    moderation_action_id: z.uuid(),
    target_type: z.enum(moderationTargetTypes),
    target_label: z.string(),
    action: z.enum(moderationActionKinds),
    reason: z.string(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    reversed_at: z.string().nullable(),
    reversal_reason: z.string().nullable(),
  })
  .strict();

function parseRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

function pageArgs(rawPage: unknown) {
  const page = moderationPageSchema.parse(rawPage);
  return { page, input_limit: PAGE_SIZE, input_offset: (page - 1) * PAGE_SIZE };
}

export type MyReport = z.infer<typeof myReportSchema>;
export type ModerationReport = z.infer<typeof moderationReportSchema>;
export type MyModerationAction = z.infer<typeof myModerationActionSchema>;
export type MyModerationAppeal = z.infer<typeof myAppealSchema>;
export type ModerationAppeal = z.infer<typeof moderationAppealSchema>;
export type PlatformModerationAction = z.infer<typeof platformModerationActionSchema>;

export async function listMyReports(rawPage: unknown = 1) {
  const { input_limit, input_offset } = pageArgs(rawPage);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_reports", { input_limit, input_offset });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(myReportSchema, data);
}

export async function listMyModerationActions(rawPage: unknown = 1) {
  const { input_limit, input_offset } = pageArgs(rawPage);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_moderation_actions", {
    input_limit,
    input_offset,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(myModerationActionSchema, data);
}

export async function listMyModerationAppeals(rawPage: unknown = 1) {
  const { input_limit, input_offset } = pageArgs(rawPage);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_moderation_appeals", {
    input_limit,
    input_offset,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(myAppealSchema, data);
}

export async function viewerIsPlatformModerator() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("viewer_is_platform_moderator");
  if (error !== null) throw domainErrorFromDatabase(error);
  return data === true;
}

export async function listModerationReports(rawStatus: unknown = null, rawPage: unknown = 1) {
  const status = reportStatusFilterSchema.parse(rawStatus);
  const { input_limit, input_offset } = pageArgs(rawPage);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_moderation_reports", {
    input_status: status ?? undefined,
    input_limit,
    input_offset,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(moderationReportSchema, data);
}

export async function listModerationAppeals(rawStatus: unknown = null, rawPage: unknown = 1) {
  const status = appealStatusFilterSchema.parse(rawStatus);
  const { input_limit, input_offset } = pageArgs(rawPage);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_moderation_appeals", {
    input_status: status ?? undefined,
    input_limit,
    input_offset,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(moderationAppealSchema, data);
}

export async function listPlatformModerationActions(rawPage: unknown = 1) {
  const { input_limit, input_offset } = pageArgs(rawPage);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_moderation_actions", {
    input_active_only: true,
    input_limit,
    input_offset,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(platformModerationActionSchema, data);
}
