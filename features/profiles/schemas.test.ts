import { describe, expect, it } from "vitest";

import { fanWorkspaceInputSchema } from "./schemas";

const validInput = {
  handle: "  Fan_One ",
  displayName: "  Fan One ",
  bio: "  Football and friends. ",
  adultAttested: "on",
  rulesAccepted: "on",
  rulesVersion: "1",
};

describe("profileInputSchema", () => {
  it("normalizes safe profile input", () => {
    const profile = fanWorkspaceInputSchema.parse(validInput);

    expect(profile).toMatchObject({
      handle: "fan_one",
      displayName: "Fan One",
      bio: "Football and friends.",
      adultAttested: true,
      rulesAccepted: true,
      rulesVersion: 1,
    });
  });

  it("requires adult attestation and current rules acceptance", () => {
    const result = fanWorkspaceInputSchema.safeParse({
      ...validInput,
      adultAttested: null,
      rulesAccepted: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.adultAttested).toContain(
        "This confirmation is required.",
      );
      expect(result.error.flatten().fieldErrors.rulesAccepted).toContain(
        "This confirmation is required.",
      );
    }
  });

  it("rejects unsafe handles and stale rule versions", () => {
    expect(fanWorkspaceInputSchema.safeParse({ ...validInput, handle: "fan-one" }).success).toBe(
      false,
    );
    expect(fanWorkspaceInputSchema.safeParse({ ...validInput, rulesVersion: "2" }).success).toBe(
      false,
    );
  });
});
