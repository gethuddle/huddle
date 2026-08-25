import { z } from "zod";

import { publicProfileHandleSchema } from "@/features/profiles/schemas";

export const blockPreferenceSchema = z.object({
  targetHandle: publicProfileHandleSchema,
  intent: z.enum(["block", "unblock"]),
});

export type BlockPreferenceInput = z.infer<typeof blockPreferenceSchema>;
