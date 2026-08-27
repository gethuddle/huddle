import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { DomainError } from "@/lib/errors";

const CURSOR_VERSION = 1 as const;
const FILTER_KEY_LENGTH = 43;

const groupCursorPayloadSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    kind: z.literal("groups"),
    filterKey: z.string().length(FILTER_KEY_LENGTH),
    name: z.string().min(1).max(80),
    id: z.uuid(),
  })
  .strict();

const eventCursorPayloadSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    kind: z.literal("events"),
    filterKey: z.string().length(FILTER_KEY_LENGTH),
    interestScore: z.number().int().nonnegative(),
    distanceBand: z.number().int().min(0).max(4),
    startsAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
  })
  .strict();

export type GroupCursorPayload = z.infer<typeof groupCursorPayloadSchema>;
export type EventCursorPayload = z.infer<typeof eventCursorPayloadSchema>;

function invalidCursor(cause?: unknown): never {
  throw new DomainError("VALIDATION_FAILED", { cause });
}

function signature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: unknown, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

function decodePayload<T>(cursor: string, secret: string, schema: z.ZodType<T>): T {
  if (cursor.length > 1024) invalidCursor();

  const parts = cursor.split(".");
  if (parts.length !== 2) invalidCursor();
  const [encodedPayload, suppliedSignature] = parts;
  if (encodedPayload === undefined || suppliedSignature === undefined) invalidCursor();

  const expectedSignature = signature(encodedPayload, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    invalidCursor();
  }

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    return schema.parse(JSON.parse(decoded));
  } catch (cause) {
    invalidCursor(cause);
  }
}

export function cursorFilterKey(filters: unknown): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("base64url");
}

export function encodeGroupCursor(
  payload: Omit<GroupCursorPayload, "version" | "kind">,
  secret: string,
): string {
  return encodePayload({ version: CURSOR_VERSION, kind: "groups", ...payload }, secret);
}

export function decodeGroupCursor(cursor: string, secret: string): GroupCursorPayload {
  return decodePayload(cursor, secret, groupCursorPayloadSchema);
}

export function encodeEventCursor(
  payload: Omit<EventCursorPayload, "version" | "kind">,
  secret: string,
): string {
  return encodePayload({ version: CURSOR_VERSION, kind: "events", ...payload }, secret);
}

export function decodeEventCursor(cursor: string, secret: string): EventCursorPayload {
  return decodePayload(cursor, secret, eventCursorPayloadSchema);
}
