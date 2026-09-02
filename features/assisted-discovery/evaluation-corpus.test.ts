import { describe, expect, it } from "vitest";

import { ASSISTED_DISCOVERY_EVALUATION_CORPUS } from "./evaluation-corpus";

describe("assisted-discovery evaluation corpus", () => {
  it("contains forty-six unique synthetic cases and the three product examples", () => {
    expect(ASSISTED_DISCOVERY_EVALUATION_CORPUS).toHaveLength(46);
    expect(new Set(ASSISTED_DISCOVERY_EVALUATION_CORPUS.map((entry) => entry.id)).size).toBe(46);
    expect(
      ASSISTED_DISCOVERY_EVALUATION_CORPUS.filter((entry) => entry.requirements.includes("core")),
    ).toHaveLength(3);
  });

  it.each(["named_month", "single_date", "bare_weekday", "date_free_default"])(
    "covers the deterministic %s behavior",
    (trait) => {
      expect(
        ASSISTED_DISCOVERY_EVALUATION_CORPUS.some((entry) => entry.traits.includes(trait)),
      ).toBe(true);
    },
  );

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
    expect(
      ASSISTED_DISCOVERY_EVALUATION_CORPUS.some((entry) => entry.traits.includes("named_place")),
    ).toBe(true);
  });
});
