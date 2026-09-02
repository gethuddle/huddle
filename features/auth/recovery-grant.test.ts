import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";

import {
  issueRecoveryGrant,
  recoveryGrantCookieOptions,
  verifyRecoveryGrant,
} from "./recovery-grant";

const secret = "a-separate-recovery-token-secret-value";
const identity = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
};
const now = new Date("2026-09-02T12:00:00.000Z");

describe("password recovery grants", () => {
  it("round-trips one user and Supabase session for five minutes", () => {
    const token = issueRecoveryGrant(identity, secret, now);

    expect(verifyRecoveryGrant(token, identity, secret, new Date(now.getTime() + 299_000))).toEqual(
      {
        version: 1,
        purpose: "password_recovery",
        userId: identity.userId,
        sessionId: identity.sessionId,
        issuedAt: 1_788_350_400,
        expiresAt: 1_788_350_700,
      },
    );
  });

  it("contains no email, password, provider credential, or raw recovery token", () => {
    const token = issueRecoveryGrant(identity, secret, now);
    const [payload] = token.split(".");
    const decoded = Buffer.from(payload ?? "", "base64url").toString("utf8");

    expect(decoded).not.toContain("fan@example.com");
    expect(decoded).not.toContain("new-super-secret");
    expect(decoded).not.toContain("token_hash");
    expect(decoded).not.toContain("access_token");
  });

  it("rejects expiry, tampering, user mismatch, session mismatch, and the wrong secret", () => {
    const token = issueRecoveryGrant(identity, secret, now);
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature?.startsWith("a") ? "b" : "a"}${signature?.slice(1)}`;

    expect(() =>
      verifyRecoveryGrant(token, identity, secret, new Date(now.getTime() + 300_000)),
    ).toThrowError(DomainError);
    expect(() =>
      verifyRecoveryGrant(token, { ...identity, userId: crypto.randomUUID() }, secret, now),
    ).toThrowError(DomainError);
    expect(() =>
      verifyRecoveryGrant(token, { ...identity, sessionId: crypto.randomUUID() }, secret, now),
    ).toThrowError(DomainError);
    expect(() => verifyRecoveryGrant(tampered, identity, secret, now)).toThrowError(DomainError);
    expect(() => verifyRecoveryGrant(token, identity, `${secret}-wrong`, now)).toThrowError(
      DomainError,
    );
  });

  it("uses hardened cookie options and secure cookies outside local", () => {
    expect(recoveryGrantCookieOptions("local")).toMatchObject({
      httpOnly: true,
      maxAge: 300,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    expect(recoveryGrantCookieOptions("production")).toMatchObject({ secure: true });
    expect(recoveryGrantCookieOptions("preview")).toMatchObject({ secure: true });
  });
});
