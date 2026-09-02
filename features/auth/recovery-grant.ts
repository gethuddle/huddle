import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { DomainError } from "@/lib/errors";

export const RECOVERY_GRANT_COOKIE_NAME = "huddle-password-recovery";

const GRANT_VERSION = 1 as const;
const GRANT_LIFETIME_SECONDS = 5 * 60;
const MAX_GRANT_LENGTH = 2048;

const recoveryGrantPayloadSchema = z
  .object({
    version: z.literal(GRANT_VERSION),
    purpose: z.literal("password_recovery"),
    userId: z.uuid(),
    sessionId: z.uuid(),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type RecoveryGrantPayload = z.infer<typeof recoveryGrantPayloadSchema>;
export type RecoveryGrantIdentity = Readonly<{ userId: string; sessionId: string }>;

function invalidGrant(cause?: unknown): never {
  throw new DomainError("AUTH_REQUIRED", { cause });
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueRecoveryGrant(
  identity: RecoveryGrantIdentity,
  secret: string,
  now = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload = recoveryGrantPayloadSchema.parse({
    version: GRANT_VERSION,
    purpose: "password_recovery",
    ...identity,
    issuedAt,
    expiresAt: issuedAt + GRANT_LIFETIME_SECONDS,
  });
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyRecoveryGrant(
  token: string,
  expectedIdentity: RecoveryGrantIdentity,
  secret: string,
  now = new Date(),
): RecoveryGrantPayload {
  if (token.length === 0 || token.length > MAX_GRANT_LENGTH) invalidGrant();
  const parts = token.split(".");
  if (parts.length !== 2) invalidGrant();
  const [encoded, suppliedSignature] = parts;
  if (encoded === undefined || suppliedSignature === undefined) invalidGrant();

  const expected = Buffer.from(signature(encoded, secret), "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) invalidGrant();

  try {
    const payload = recoveryGrantPayloadSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      payload.userId !== expectedIdentity.userId ||
      payload.sessionId !== expectedIdentity.sessionId ||
      nowSeconds >= payload.expiresAt ||
      payload.expiresAt - payload.issuedAt !== GRANT_LIFETIME_SECONDS
    ) {
      invalidGrant();
    }
    return payload;
  } catch (cause) {
    if (cause instanceof DomainError) throw cause;
    invalidGrant(cause);
  }
}

export function recoveryGrantCookieOptions(environment: "local" | "preview" | "production") {
  return {
    httpOnly: true,
    maxAge: GRANT_LIFETIME_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: environment !== "local",
  };
}
