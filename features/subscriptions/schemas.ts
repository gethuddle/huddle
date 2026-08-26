import { z } from "zod";

export const subscriptionPreferenceSchema = z
  .object({
    kind: z.enum(["sport", "competition", "team"]),
    targetId: z.uuid(),
    intent: z.enum(["follow", "unfollow"]),
  })
  .strict();

export type SubscriptionKind = z.infer<typeof subscriptionPreferenceSchema>["kind"];
