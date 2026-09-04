import { describe, expect, it } from "vitest";

import { resolveQueryDateRange } from "./query-date";

describe("resolveQueryDateRange", () => {
  const wednesday = new Date("2026-09-02T09:00:00.000Z");

  it.each([
    ["tonight", "2026-09-04", "2026-09-04"],
    ["this evening", "2026-09-04", "2026-09-04"],
    ["day after tomorrow", "2026-09-06", "2026-09-06"],
    ["from Friday to Sunday", "2026-09-04", "2026-09-06"],
    ["Friday–Sunday", "2026-09-04", "2026-09-06"],
  ])("resolves the whole relative expression %s", (phrase, fromDate, toDate) => {
    expect(resolveQueryDateRange(`Liverpool ${phrase}`, new Date("2026-09-04T09:00:00Z"))).toEqual({
      kind: "resolved",
      fromDate,
      toDate,
    });
  });

  it.each([
    ["yesterday", "past"],
    ["last Friday", "past"],
    ["this week", "invalid"],
    ["next weekend", "invalid"],
    ["today or tomorrow", "invalid"],
    ["tomorrow and next Friday", "invalid"],
    ["Friday or Sunday", "invalid"],
    ["not tomorrow", "invalid"],
    ["on 2026-09-05 or 2026-09-07", "invalid"],
    ["October 5 and October 7", "invalid"],
    ["October or November", "invalid"],
    ["tomorrow in October", "invalid"],
    ["on 2026-09-05, 2026-09-07 and 2026-09-09", "invalid"],
    ["before October 5", "invalid"],
    ["at the weekend", "invalid"],
  ])("clarifies %s instead of ignoring or partially matching it", (phrase, reason) => {
    expect(resolveQueryDateRange(`Liverpool ${phrase}`, new Date("2026-09-04T09:00:00Z"))).toEqual({
      kind: "invalid",
      reason,
    });
  });

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

  it.each([
    ["from 2026-09-05 to 2026-09-07", "2026-09-05", "2026-09-07"],
    ["from October 5 through October 7", "2026-10-05", "2026-10-07"],
    ["between October 5 and October 7", "2026-10-05", "2026-10-07"],
  ])("keeps a clearly stated calendar range %s", (query, fromDate, toDate) => {
    expect(resolveQueryDateRange(query, wednesday)).toEqual({ kind: "resolved", fromDate, toDate });
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
