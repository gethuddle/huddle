import { z } from "zod";

import { publicProfileHandleSchema } from "@/features/profiles/schemas";

const friendshipTargetSchema = z.object({
  targetHandle: publicProfileHandleSchema,
});

export const friendshipMutationSchema = z.discriminatedUnion("intent", [
  friendshipTargetSchema.extend({ intent: z.literal("request") }),
  friendshipTargetSchema.extend({
    intent: z.enum(["accept", "decline", "remove"]),
    friendshipId: z.uuid(),
  }),
]);

export const friendshipBucketSchema = z.enum(["incoming", "outgoing", "accepted"]);

export const friendshipListQuerySchema = z.object({
  bucket: friendshipBucketSchema.catch("incoming"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type FriendshipMutationInput = z.infer<typeof friendshipMutationSchema>;
export type FriendshipBucket = z.infer<typeof friendshipBucketSchema>;
