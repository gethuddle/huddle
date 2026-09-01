import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";

import { decodeContinuationToken, encodeContinuationToken } from "./continuation-token";
import type { ResolvedAssistedDiscoveryIntent } from "./schemas";

const secret = "a-dedicated-assisted-discovery-token-secret";
const actorId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-01T09:00:00.000Z");
const intent: ResolvedAssistedDiscoveryIntent = {
  version: 1,
  fromDate: "2026-09-02",
  toDate: "2026-09-02",
  teamIds: ["22222222-2222-4222-8222-222222222222"],
  teamNames: ["Arsenal FC"],
  competitionId: null,
  competitionName: null,
  relationship: "any",
  hostKind: "venue",
  proximity: "nearby",
  requiredFacilities: ["food"],
  requiresOrigin: true,
};

describe("assisted-discovery continuation tokens", () => {
  it("round-trips a resolved intent for five minutes", () => {
    const token = encodeContinuationToken({ actorId, intent }, secret, now);

    expect(
      decodeContinuationToken(token, actorId, secret, new Date(now.getTime() + 299_000)),
    ).toEqual({
      version: 1,
      actorId,
      expiresAt: 1_788_253_500,
      intent,
    });
  });

  it("contains neither the raw query nor an origin", () => {
    const token = encodeContinuationToken({ actorId, intent }, secret, now);
    const [payload] = token.split(".");
    const decoded = Buffer.from(payload, "base64url").toString("utf8");

    expect(decoded).not.toContain("I want a match near me");
    expect(decoded).not.toContain("32.0853");
    expect(decoded).not.toContain("origin");
  });

  it("rejects expiry, actor mismatch, tampering, and the wrong secret", () => {
    const token = encodeContinuationToken({ actorId, intent }, secret, now);
    const otherActor = "33333333-3333-4333-8333-333333333333";
    const [payload, signature] = token.split(".");
    const changedSignature = `${signature?.startsWith("a") ? "b" : "a"}${signature?.slice(1)}`;

    expect(() =>
      decodeContinuationToken(token, actorId, secret, new Date(now.getTime() + 300_001)),
    ).toThrowError(DomainError);
    expect(() => decodeContinuationToken(token, otherActor, secret, now)).toThrowError(DomainError);
    expect(() =>
      decodeContinuationToken(`${payload}.${changedSignature}`, actorId, secret, now),
    ).toThrowError(DomainError);
    expect(() => decodeContinuationToken(token, actorId, `${secret}-wrong`, now)).toThrowError(
      DomainError,
    );
  });

  it("rejects oversized input before decoding it", () => {
    expect(() => decodeContinuationToken("x".repeat(5000), actorId, secret, now)).toThrowError(
      DomainError,
    );
  });
});
