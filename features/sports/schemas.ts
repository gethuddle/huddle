import { z } from "zod";

export const sportsSyncRequestSchema = z
  .object({
    reason: z.enum(["scheduled", "manual", "retry"]).default("scheduled"),
  })
  .strict();

export type SportsSyncReason = z.infer<typeof sportsSyncRequestSchema>["reason"];
