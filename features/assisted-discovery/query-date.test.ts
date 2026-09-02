import { describe, expect, it } from "vitest";

import { resolveQueryDateRange } from "./query-date";

describe("resolveQueryDateRange", () => {
  const wednesday = new Date("2026-09-02T09:00:00.000Z");

  it.each([
    ["anything in October", "2026-10-01", "2026-10-31"],
    ["anything in October 2027", "2027-10-01", "2027-10-31"],
    ["anything on 5 October", "2026-10-05", "2026-10-05"],
    ["anything on October 5th 2026", "2026-10-05", "2026-10-05"],
    ["anything on 2026-10-05", "2026-10-05", "2026-10-05"],
    ["anything Wednesday", "2026-09-02", "2026-09-02"],
    ["anything this Wednesday", "2026-09-02", "2026-09-02"],
    ["anything next Wednesday", "2026-09-09", "2026-09-09"],
  ] as const)("resolves %s", (query, fromDate, toDate) => {
    expect(resolveQueryDateRange(query, wednesday)).toEqual({
      kind: "resolved",
      fromDate,
      toDate,
    });
  });

  it("clamps the current month to today", () => {
    expect(resolveQueryDateRange("show September huddles", wednesday)).toEqual({
      kind: "resolved",
      fromDate: "2026-09-02",
      toDate: "2026-09-30",
    });
  });

  it("uses the next occurrence when an unqualified month has already passed", () => {
    expect(resolveQueryDateRange("show August huddles", wednesday)).toEqual({
      kind: "resolved",
      fromDate: "2027-08-01",
      toDate: "2027-08-31",
    });
  });

  it.each(["football at a venue", "Arsenal against Chelsea with food"])(
    "keeps a truly date-free query absent: %s",
    (query) => {
      expect(resolveQueryDateRange(query, wednesday)).toEqual({ kind: "absent" });
    },
  );

  it.each([
    ["anything on 31 February", "invalid"],
    ["anything in February 2025", "past"],
    ["anything sometime in 2027", "invalid"],
    ["anything in three weeks", "invalid"],
  ] as const)("rejects unresolved or invalid date language in %s", (query, reason) => {
    expect(resolveQueryDateRange(query, wednesday)).toEqual({ kind: "invalid", reason });
  });
});
