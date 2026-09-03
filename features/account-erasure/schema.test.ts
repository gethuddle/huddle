import { describe, expect, it } from "vitest";

import { deleteAccountSchema } from "./schema";

describe("deleteAccountSchema", () => {
  it("accepts a bounded current password with the exact DELETE confirmation", () => {
    expect(
      deleteAccountSchema.parse({
        currentPassword: "current-password",
        confirmation: "DELETE",
      }),
    ).toEqual({
      currentPassword: "current-password",
      confirmation: "DELETE",
    });
  });

  it.each([
    {
      name: "an empty current password",
      input: { currentPassword: "", confirmation: "DELETE" },
      field: "currentPassword",
      message: "Enter your current password.",
    },
    {
      name: "a 73-character current password",
      input: { currentPassword: "p".repeat(73), confirmation: "DELETE" },
      field: "currentPassword",
      message: "Use 72 characters or fewer.",
    },
    {
      name: "lowercase confirmation",
      input: { currentPassword: "current-password", confirmation: "delete" },
      field: "confirmation",
      message: "Type DELETE exactly to confirm.",
    },
    {
      name: "confirmation longer than 16 characters",
      input: { currentPassword: "current-password", confirmation: "D".repeat(17) },
      field: "confirmation",
      message: "Type DELETE to confirm.",
    },
  ] as const)("rejects $name", ({ input, field, message }) => {
    const result = deleteAccountSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors[field]).toContain(message);
  });
});
