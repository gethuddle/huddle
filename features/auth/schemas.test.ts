import { describe, expect, it } from "vitest";

import {
  passwordResetRequestSchema,
  passwordUpdateSchema,
  recoveryQuerySchema,
  signInSchema,
  signUpSchema,
  verificationCodeQuerySchema,
  verificationQuerySchema,
} from "./schemas";

describe("auth schemas", () => {
  it("normalizes a valid signup email", () => {
    const result = signUpSchema.parse({
      email: "  Fan@Example.COM ",
      password: "matchday-strong",
      confirmPassword: "matchday-strong",
    });

    expect(result.email).toBe("fan@example.com");
  });

  it("rejects short or mismatched signup passwords", () => {
    const shortPassword = signUpSchema.safeParse({
      email: "fan@example.com",
      password: "short",
      confirmPassword: "short",
    });
    const mismatchedPassword = signUpSchema.safeParse({
      email: "fan@example.com",
      password: "matchday-strong",
      confirmPassword: "something-else",
    });

    expect(shortPassword.success).toBe(false);
    expect(mismatchedPassword.success).toBe(false);
    if (!mismatchedPassword.success) {
      expect(mismatchedPassword.error.flatten().fieldErrors.confirmPassword).toContain(
        "Passwords must match.",
      );
    }
  });

  it("rejects invalid sign-in input", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "tiny" });

    expect(result.success).toBe(false);
  });

  it("accepts only the fixed email verification query shape", () => {
    expect(verificationQuerySchema.safeParse({ tokenHash: "hash", type: "email" }).success).toBe(
      true,
    );
    expect(verificationQuerySchema.safeParse({ tokenHash: "hash", type: "recovery" }).success).toBe(
      false,
    );
    expect(verificationQuerySchema.safeParse({ tokenHash: "", type: "email" }).success).toBe(false);
  });

  it("accepts only bounded PKCE confirmation codes", () => {
    expect(verificationCodeQuerySchema.safeParse({ code: "auth-code" }).success).toBe(true);
    expect(verificationCodeQuerySchema.safeParse({ code: "" }).success).toBe(false);
    expect(verificationCodeQuerySchema.safeParse({ code: null }).success).toBe(false);
  });

  it("normalizes a valid password-reset email and rejects malformed addresses", () => {
    expect(passwordResetRequestSchema.parse({ email: " Fan@Example.COM " })).toEqual({
      email: "fan@example.com",
    });
    expect(passwordResetRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("requires a bounded new password and matching confirmation", () => {
    expect(
      passwordUpdateSchema.parse({
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    ).toEqual({
      password: "new-matchday-password",
      confirmPassword: "new-matchday-password",
    });
    const mismatch = passwordUpdateSchema.safeParse({
      password: "new-matchday-password",
      confirmPassword: "different-password",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.flatten().fieldErrors.confirmPassword).toContain(
        "Passwords must match.",
      );
    }
  });

  it("accepts recovery token hashes only for the recovery OTP type", () => {
    expect(recoveryQuerySchema.safeParse({ tokenHash: "hash", type: "recovery" }).success).toBe(
      true,
    );
    expect(recoveryQuerySchema.safeParse({ tokenHash: "hash", type: "email" }).success).toBe(false);
  });
});
