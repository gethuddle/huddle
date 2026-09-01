import { describe, expect, it } from "vitest";

import { ASSISTED_DISCOVERY_EVALUATION_CORPUS } from "./evaluation-corpus";

describe("assisted-discovery evaluation corpus", () => {
  it("contains forty unique synthetic cases and the three product examples", () => {
    expect(ASSISTED_DISCOVERY_EVALUATION_CORPUS).toHaveLength(40);
    expect(new Set(ASSISTED_DISCOVERY_EVALUATION_CORPUS.map((entry) => entry.id)).size).toBe(40);
    expect(
      ASSISTED_DISCOVERY_EVALUATION_CORPUS.filter((entry) => entry.requirements.includes("core")),
    ).toHaveLength(3);
  });

  it.each(["privacy", "unsupported_scope", "date_boundary"] as const)(
    "covers the mandatory %s gate",
    (requirement) => {
      expect(
        ASSISTED_DISCOVERY_EVALUATION_CORPUS.filter((entry) =>
          entry.requirements.includes(requirement),
        ).length,
      ).toBeGreaterThanOrEqual(4);
    },
  );

  it("includes typo and malformed-output prompt-injection pressure", () => {
    expect(
      ASSISTED_DISCOVERY_EVALUATION_CORPUS.some((entry) => entry.traits.includes("typo")),
    ).toBe(true);
    expect(
      ASSISTED_DISCOVERY_EVALUATION_CORPUS.some((entry) =>
        entry.traits.includes("malformed_output_request"),
      ),
    ).toBe(true);
  });
});
