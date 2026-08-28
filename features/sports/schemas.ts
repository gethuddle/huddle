import { z } from "zod";

export const SPORTS_SYNC_MAX_BODY_BYTES = 4096;

export function sportsSyncRequestBodyIsTooLarge(body: string) {
  return new TextEncoder().encode(body).byteLength > SPORTS_SYNC_MAX_BODY_BYTES;
}

export const sportsSyncRequestSchema = z
  .object({
    reason: z.enum(["scheduled", "manual", "retry"]).default("scheduled"),
  })
  .strict();

export type SportsSyncReason = z.infer<typeof sportsSyncRequestSchema>["reason"];
