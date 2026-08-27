import { z } from "zod";

const optionalUuidSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.uuid().nullable(),
);

export const groupSlugSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "Use at least 3 characters.")
      .max(60, "Use 60 characters or fewer.")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  );

export const groupCreationSchema = z.object({
  intent: z.enum(["check", "create"]),
  name: z.string().trim().min(3, "Use at least 3 characters.").max(80),
  slug: groupSlugSchema,
  cityId: z.uuid(),
  teamId: optionalUuidSchema,
  visibility: z.enum(["discoverable", "unlisted"]),
  description: z.string().trim().max(2000, "Use 2,000 characters or fewer."),
});

export const groupRouteSlugSchema = groupSlugSchema;

export const groupMemberListQuerySchema = z.object({
  membersPage: z.coerce.number().int().min(1).catch(1),
});

export const groupApplicationMessageSchema = z
  .string()
  .trim()
  .max(1000, "Use 1,000 characters or fewer.");

export const groupApplicationSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  message: groupApplicationMessageSchema,
});

export const groupApplicationReviewSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  userId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});

export const groupEventReviewSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  eventId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});

export const groupLeaveSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
});

export const groupInviteTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "That invitation is not available.");

export const groupInviteCreationSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  durationDays: z.coerce.number().int().min(1).max(30),
  maxUses: z.coerce.number().int().min(1).max(100),
});

export const groupInviteConsumptionSchema = z.object({
  token: groupInviteTokenSchema,
  message: groupApplicationMessageSchema,
});

export const groupInviteRevocationSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  inviteId: z.uuid(),
});

export const groupRoleChangeSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  userId: z.uuid(),
  role: z.enum(["admin", "member"]),
});

export const groupBanSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  userId: z.uuid(),
  reason: z.string().trim().min(3, "Use at least 3 characters.").max(500),
});

export const groupUnbanSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  userId: z.uuid(),
});

export const groupRuleTextSchema = z
  .string()
  .trim()
  .min(1, "Enter a rule.")
  .max(500, "Use 500 characters or fewer.");

export const groupRuleCreationSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  text: groupRuleTextSchema,
  published: z.boolean(),
});

export const groupRuleUpdateSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  ruleId: z.uuid(),
  text: groupRuleTextSchema,
  published: z.boolean(),
});

export const groupRuleReorderSchema = z.object({
  groupId: z.uuid(),
  groupSlug: groupRouteSlugSchema,
  ruleIds: z.array(z.uuid()).min(1).max(100),
});

export const groupManagementSectionSchema = z.enum([
  "events",
  "applications",
  "members",
  "invites",
  "bans",
  "rules",
]);

export const groupManagementQuerySchema = z.object({
  section: groupManagementSectionSchema.catch("applications"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type GroupCreationInput = z.infer<typeof groupCreationSchema>;
export type GroupManagementSection = z.infer<typeof groupManagementSectionSchema>;
