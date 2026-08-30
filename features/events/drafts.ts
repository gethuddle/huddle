import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  eventDraftSaveInputSchema,
  eventDraftValuesSchema,
  type EventDraftSaveInput,
} from "@/features/events/schemas";
import type { EventDraftOwnerRecord, FinalizedEvent } from "@/features/events/state";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import type { Database } from "@/types/database.generated";

type DraftClient = Pick<SupabaseClient<Database>, "rpc">;

const draftRowSchema = z
  .object({
    draft_id: z.uuid(),
    step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    draft_values: eventDraftValuesSchema,
    organizing_group_id: z.uuid().nullable(),
    private_address_text: z.string().min(5).max(300).nullable(),
    private_directions_text: z.string().min(1).max(500).nullable(),
    private_longitude: z.number().min(34).max(36).nullable(),
    private_latitude: z.number().min(29).max(34).nullable(),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((row, context) => {
    const protectedCore = [row.private_address_text, row.private_longitude, row.private_latitude];
    const hasProtectedCore = protectedCore.every((value) => value !== null);
    const hasNoProtectedValue = [...protectedCore, row.private_directions_text].every(
      (value) => value === null,
    );
    if (!hasProtectedCore && !hasNoProtectedValue) {
      context.addIssue({
        code: "custom",
        message: "Protected draft location columns must be complete or absent.",
      });
    }
  });

const finalizedEventRowSchema = z
  .object({
    event_id: z.uuid(),
    status: z.enum(["pending_group_review", "published"]),
  })
  .strict();

function parseDraftRow(value: unknown): EventDraftOwnerRecord {
  try {
    const row = draftRowSchema.parse(value);
    const protectedLocation =
      row.private_address_text === null ||
      row.private_longitude === null ||
      row.private_latitude === null
        ? null
        : {
            addressText: row.private_address_text,
            directionsText: row.private_directions_text,
            longitude: row.private_longitude,
            latitude: row.private_latitude,
          };

    return {
      draft: {
        id: row.draft_id,
        step: row.step,
        values: row.draft_values,
        savedAt: row.updated_at,
      },
      organizingGroupId: row.organizing_group_id,
      protectedLocation,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

function parseFinalizedEvent(value: unknown): FinalizedEvent {
  try {
    const row = finalizedEventRowSchema.parse(value);
    return { id: row.event_id, status: row.status };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function saveEventDraft(
  client: DraftClient,
  input: EventDraftSaveInput,
): Promise<EventDraftOwnerRecord> {
  const parsed = eventDraftSaveInputSchema.parse(input);
  const protectedValue =
    parsed.privateLocation.mode === "replace" ? parsed.privateLocation.value : null;
  const { data, error } = await client.rpc("save_event_draft", {
    // Generated RPC types do not preserve nullable SQL arguments.
    input_draft_id: parsed.id as string,
    input_step: parsed.step,
    input_values: parsed.values,
    input_organizing_group_id: parsed.organizingGroupId as string,
    input_private_mode: parsed.privateLocation.mode,
    input_private_address_text: (protectedValue?.addressText ?? null) as string,
    input_private_directions_text: (protectedValue?.directionsText ?? null) as string,
    input_private_longitude: (protectedValue?.longitude ?? null) as number,
    input_private_latitude: (protectedValue?.latitude ?? null) as number,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseDraftRow(data.at(0));
}

export async function getEventDraft(
  client: DraftClient,
  draftId: string,
): Promise<EventDraftOwnerRecord> {
  const parsedId = z.uuid().parse(draftId);
  const { data, error } = await client.rpc("get_event_draft", {
    input_draft_id: parsedId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseDraftRow(data.at(0));
}

export async function discardEventDraft(client: DraftClient, draftId: string): Promise<void> {
  const parsedId = z.uuid().parse(draftId);
  const { data, error } = await client.rpc("discard_event_draft", {
    input_draft_id: parsedId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  if (data !== true) throw new DomainError("INTERNAL_ERROR");
}

export async function finalizeEventDraft(
  client: DraftClient,
  draftId: string,
  requestId: string,
): Promise<FinalizedEvent> {
  const parsedId = z.uuid().parse(draftId);
  const parsedRequestId = z.uuid().parse(requestId);
  const { data, error } = await client.rpc("finalize_event_draft", {
    input_draft_id: parsedId,
    audit_request_id: parsedRequestId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseFinalizedEvent(data.at(0));
}
