import { describe, expect, it } from "vitest";

import { formatJerusalemDateValue, formatJerusalemKickoff, jerusalemDayUtcBounds } from "./time";

describe("Jerusalem fixture time", () => {
  it("maps a summer Jerusalem day to the correct UTC interval", () => {
    expect(jerusalemDayUtcBounds("2026-08-26")).toEqual({
      start: "2026-08-25T21:00:00.000Z",
      end: "2026-08-26T21:00:00.000Z",
    });
  });

  it("maps a winter Jerusalem day to the correct UTC interval", () => {
    expect(jerusalemDayUtcBounds("2026-12-15")).toEqual({
      start: "2026-12-14T22:00:00.000Z",
      end: "2026-12-15T22:00:00.000Z",
    });
  });

  it("formats UTC fixture instants and date values in Jerusalem", () => {
    expect(formatJerusalemKickoff("2026-08-26T17:30:00Z")).toContain("20:30");
    expect(formatJerusalemDateValue(new Date("2026-08-25T22:30:00Z"))).toBe("2026-08-26");
  });
});
