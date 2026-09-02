import { describe, expect, it } from "vitest";

import {
  knownPasswordUpdateSchema,
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

  it("requires 15–72 characters for new passwords without composition rules", () => {
    expect(
      signUpSchema.safeParse({
        email: "fan@example.com",
        password: "12345678901234",
        confirmPassword: "12345678901234",
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        email: "fan@example.com",
        password: "123456789012345",
        confirmPassword: "123456789012345",
      }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({
        email: "fan@example.com",
        password: "a".repeat(73),
        confirmPassword: "a".repeat(73),
      }).success,
    ).toBe(false);
  });

  it("rejects mismatched signup passwords", () => {
    const mismatchedPassword = signUpSchema.safeParse({
      email: "fan@example.com",
      password: "matchday-strong",
      confirmPassword: "something-else",
    });
    expect(mismatchedPassword.success).toBe(false);
    if (!mismatchedPassword.success) {
      expect(mismatchedPassword.error.flatten().fieldErrors.confirmPassword).toContain(
        "Passwords must match.",
      );
    }
  });

  it("lets existing accounts submit any non-empty password up to 72 characters", () => {
    expect(signInSchema.safeParse({ email: "fan@example.com", password: "old-pass" }).success).toBe(
      true,
    );
    expect(signInSchema.safeParse({ email: "fan@example.com", password: "" }).success).toBe(false);
    expect(
      signInSchema.safeParse({ email: "fan@example.com", password: "a".repeat(73) }).success,
    ).toBe(false);
  });

  it("rejects invalid sign-in email input", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "old-pass" });

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

  it("bounds every repeated password field to the provider password limit", () => {
    const overlongConfirmation = "a".repeat(73);

    for (const result of [
      signUpSchema.safeParse({
        email: "fan@example.com",
        password: "new-matchday-password",
        confirmPassword: overlongConfirmation,
      }),
      passwordUpdateSchema.safeParse({
        password: "new-matchday-password",
        confirmPassword: overlongConfirmation,
      }),
      knownPasswordUpdateSchema.safeParse({
        currentPassword: "old-pass",
        password: "new-matchday-password",
        confirmPassword: overlongConfirmation,
      }),
    ]) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.confirmPassword).toContain(
          "Use 72 characters or fewer.",
        );
      }
    }
  });

  it("requires the current password for an ordinary account password change", () => {
    expect(
      knownPasswordUpdateSchema.parse({
        currentPassword: "old-pass",
        password: "a new secure passphrase",
        confirmPassword: "a new secure passphrase",
      }),
    ).toEqual({
      currentPassword: "old-pass",
      password: "a new secure passphrase",
      confirmPassword: "a new secure passphrase",
    });
    expect(
      knownPasswordUpdateSchema.safeParse({
        currentPassword: "",
        password: "a new secure passphrase",
        confirmPassword: "a new secure passphrase",
      }).success,
    ).toBe(false);
  });

  it("accepts recovery token hashes only for the recovery OTP type", () => {
    expect(recoveryQuerySchema.safeParse({ tokenHash: "hash", type: "recovery" }).success).toBe(
      true,
    );
    expect(recoveryQuerySchema.safeParse({ tokenHash: "hash", type: "email" }).success).toBe(false);
  });
});
