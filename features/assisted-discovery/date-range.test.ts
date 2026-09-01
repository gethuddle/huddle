import { describe, expect, it } from "vitest";

import { resolveIntentDateRange } from "./date-range";

describe("assisted-discovery Israel date ranges", () => {
  const tuesday = new Date("2026-09-01T09:00:00.000Z");

  it.each([
    ["unspecified", "2026-09-01", "2026-09-15"],
    ["today", "2026-09-01", "2026-09-01"],
    ["tomorrow", "2026-09-02", "2026-09-02"],
    ["this_weekend", "2026-09-04", "2026-09-06"],
    ["next_week", "2026-09-06", "2026-09-12"],
  ] as const)("resolves %s without trusting model-issued dates", (temporal, fromDate, toDate) => {
    expect(
      resolveIntentDateRange({ temporal, explicitStartDate: null, explicitEndDate: null }, tuesday),
    ).toEqual({ ok: true, fromDate, toDate });
  });

  it("clamps this weekend to today once the weekend has started", () => {
    expect(
      resolveIntentDateRange(
        { temporal: "this_weekend", explicitStartDate: null, explicitEndDate: null },
        new Date("2026-09-05T09:00:00.000Z"),
      ),
    ).toEqual({ ok: true, fromDate: "2026-09-05", toDate: "2026-09-06" });
  });

  it("accepts a future explicit range of at most 31 calendar days", () => {
    expect(
      resolveIntentDateRange(
        {
          temporal: "explicit_range",
          explicitStartDate: "2026-09-02",
          explicitEndDate: "2026-10-02",
        },
        tuesday,
      ),
    ).toEqual({ ok: true, fromDate: "2026-09-02", toDate: "2026-10-02" });
  });

  it.each([
    ["2026-08-31", "2026-09-02", "past"],
    ["2026-09-02", "2026-10-03", "too_wide"],
    ["2026-09-03", "2026-09-02", "invalid"],
  ] as const)("rejects the explicit range %s through %s", (start, end, reason) => {
    expect(
      resolveIntentDateRange(
        { temporal: "explicit_range", explicitStartDate: start, explicitEndDate: end },
        tuesday,
      ),
    ).toEqual({ ok: false, reason });
  });
});
