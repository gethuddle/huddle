import { describe, expect, it } from "vitest";

import { signInSchema, signUpSchema, verificationQuerySchema } from "./schemas";

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
});
