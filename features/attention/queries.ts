import "server-only";

import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { attentionKinds, type AttentionItem } from "@/features/attention/types";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";

const attentionRowSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(attentionKinds),
    resource_id: z.uuid(),
    href: z.string().startsWith("/"),
    title: z.string().min(1),
    description: z.string().min(1),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const attentionLimitSchema = z.number().int().min(1).max(50);

export function parseAttentionItems(value: unknown): readonly AttentionItem[] {
  try {
    return z
      .array(attentionRowSchema)
      .parse(value)
      .map((row) => ({
        key: row.key,
        kind: row.kind,
        resourceId: row.resource_id,
        href: row.href,
        title: row.title,
        description: row.description,
        createdAt: row.created_at,
      }));
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function listAttentionItems(limit = 10): Promise<readonly AttentionItem[]> {
  const parsedLimit = attentionLimitSchema.safeParse(limit);
  if (!parsedLimit.success) {
    throw new DomainError("VALIDATION_FAILED", { cause: parsedLimit.error });
  }
  const { supabase } = await requireActor("fan");
  const { data, error } = await supabase.rpc("list_attention_items", {
    input_limit: parsedLimit.data,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseAttentionItems(data);
}
