import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { DomainError } from "@/lib/errors";

import {
  resolvedAssistedDiscoveryIntentSchema,
  type ResolvedAssistedDiscoveryIntent,
} from "./schemas";

const TOKEN_VERSION = 1 as const;
const TOKEN_LIFETIME_SECONDS = 5 * 60;
const MAX_TOKEN_LENGTH = 4096;

const continuationTokenPayloadSchema = z
  .object({
    version: z.literal(TOKEN_VERSION),
    actorId: z.uuid(),
    expiresAt: z.number().int().positive(),
    intent: resolvedAssistedDiscoveryIntentSchema,
  })
  .strict();

export type ContinuationTokenPayload = z.infer<typeof continuationTokenPayloadSchema>;

function invalidToken(cause?: unknown): never {
  throw new DomainError("VALIDATION_FAILED", { cause });
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeContinuationToken(
  input: Readonly<{ actorId: string; intent: ResolvedAssistedDiscoveryIntent }>,
  secret: string,
  now = new Date(),
): string {
  const payload = continuationTokenPayloadSchema.parse({
    version: TOKEN_VERSION,
    actorId: input.actorId,
    expiresAt: Math.floor(now.getTime() / 1000) + TOKEN_LIFETIME_SECONDS,
    intent: input.intent,
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function decodeContinuationToken(
  token: string,
  expectedActorId: string,
  secret: string,
  now = new Date(),
): ContinuationTokenPayload {
  if (token.length > MAX_TOKEN_LENGTH) invalidToken();
  const parts = token.split(".");
  if (parts.length !== 2) invalidToken();
  const [encodedPayload, suppliedSignature] = parts;
  if (encodedPayload === undefined || suppliedSignature === undefined) invalidToken();

  const expectedSignature = sign(encodedPayload, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    invalidToken();
  }

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = continuationTokenPayloadSchema.parse(JSON.parse(decoded));
    if (payload.actorId !== expectedActorId) invalidToken();
    if (Math.floor(now.getTime() / 1000) >= payload.expiresAt) invalidToken();
    return payload;
  } catch (cause) {
    if (cause instanceof DomainError) throw cause;
    invalidToken(cause);
  }
}
