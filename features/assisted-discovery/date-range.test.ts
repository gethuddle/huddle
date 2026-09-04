import { describe, expect, it } from "vitest";

import { resolveIntentDateRange } from "./date-range";

describe("assisted-discovery Israel date ranges", () => {
  const tuesday = new Date("2026-09-01T09:00:00.000Z");

  it("keeps tonight to one Israel date even when the model omits its date", () => {
    expect(
      resolveIntentDateRange(
        { temporal: "unspecified", weekday: null, explicitStartDate: null, explicitEndDate: null },
        new Date("2026-09-04T09:00:00Z"),
        "Where can I watch Liverpool tonight?",
      ),
    ).toEqual({ ok: true, fromDate: "2026-09-04", toDate: "2026-09-04" });
  });

  it.each([
    ["unspecified", "2026-09-01", "2026-09-15"],
    ["today", "2026-09-01", "2026-09-01"],
    ["tomorrow", "2026-09-02", "2026-09-02"],
    ["this_weekend", "2026-09-04", "2026-09-06"],
    ["next_week", "2026-09-06", "2026-09-12"],
  ] as const)("resolves %s without trusting model-issued dates", (temporal, fromDate, toDate) => {
    expect(
      resolveIntentDateRange(
        { temporal, weekday: null, explicitStartDate: null, explicitEndDate: null },
        tuesday,
      ),
    ).toEqual({ ok: true, fromDate, toDate });
  });

  it("uses the 14-day default only when the query has no date signal", () => {
    const input = {
      temporal: "unspecified",
      weekday: null,
      explicitStartDate: null,
      explicitEndDate: null,
    } as const;

    expect(resolveIntentDateRange(input, tuesday, "Arsenal at a venue with food")).toEqual({
      ok: true,
      fromDate: "2026-09-01",
      toDate: "2026-09-15",
    });
    expect(resolveIntentDateRange(input, tuesday, "Anything in October")).toEqual({
      ok: true,
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    });
    expect(resolveIntentDateRange(input, tuesday, "Anything in three weeks")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it.each(["tommorow", "tomorow"])(
    "preserves tomorrow intent for the common misspelling %s",
    (misspelling) => {
      expect(
        resolveIntentDateRange(
          {
            temporal: "tomorrow",
            weekday: null,
            explicitStartDate: null,
            explicitEndDate: null,
          },
          tuesday,
          `Anything to watch ${misspelling}?`,
        ),
      ).toEqual({ ok: true, fromDate: "2026-09-02", toDate: "2026-09-02" });
    },
  );

  it("treats the typed query as authoritative over model-issued date fields", () => {
    expect(
      resolveIntentDateRange(
        {
          temporal: "explicit_range",
          weekday: null,
          explicitStartDate: "2026-09-03",
          explicitEndDate: "2026-09-04",
        },
        tuesday,
        "Anything in October",
      ),
    ).toEqual({ ok: true, fromDate: "2026-10-01", toDate: "2026-10-31" });

    expect(
      resolveIntentDateRange(
        {
          temporal: "tomorrow",
          weekday: null,
          explicitStartDate: null,
          explicitEndDate: null,
        },
        tuesday,
        "Arsenal at a venue with food",
      ),
    ).toEqual({ ok: true, fromDate: "2026-09-01", toDate: "2026-09-15" });
  });

  it("clamps this weekend to today once the weekend has started", () => {
    expect(
      resolveIntentDateRange(
        {
          temporal: "this_weekend",
          weekday: null,
          explicitStartDate: null,
          explicitEndDate: null,
        },
        new Date("2026-09-05T09:00:00.000Z"),
      ),
    ).toEqual({ ok: true, fromDate: "2026-09-05", toDate: "2026-09-06" });
  });

  it.each([
    ["2026-09-01T09:00:00.000Z", "2026-09-02"],
    ["2026-09-02T09:00:00.000Z", "2026-09-09"],
  ])("resolves next Wednesday from %s to one exact future day", (clock, expectedDate) => {
    const input = {
      temporal: "next_weekday",
      weekday: "wednesday",
      explicitStartDate: null,
      explicitEndDate: null,
    } as const;

    expect(resolveIntentDateRange(input, new Date(clock))).toEqual({
      ok: true,
      fromDate: expectedDate,
      toDate: expectedDate,
    });
  });

  it("accepts a future explicit range of at most 31 calendar days", () => {
    expect(
      resolveIntentDateRange(
        {
          temporal: "explicit_range",
          weekday: null,
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
        {
          temporal: "explicit_range",
          weekday: null,
          explicitStartDate: start,
          explicitEndDate: end,
        },
        tuesday,
      ),
    ).toEqual({ ok: false, reason });
  });
});
