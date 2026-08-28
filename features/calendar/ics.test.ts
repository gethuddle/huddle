import { describe, expect, it } from "vitest";

import { escapeIcsText, foldIcsLine, formatIcsUtc, serializeCalendarEvent } from "./ics";

describe("RFC 5545 calendar serialization", () => {
  it("escapes text and emits UTC timestamps", () => {
    expect(escapeIcsText("One, two; path\\next\nline")).toBe("One\\, two\\; path\\\\next\\nline");
    expect(formatIcsUtc("2026-08-28T18:45:30.000Z")).toBe("20260828T184530Z");
  });

  it("folds every physical line to at most 75 UTF-8 octets", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"אוהדים cozy huddle ".repeat(12)}`);
    const encoder = new TextEncoder();
    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).byteLength).toBeLessThanOrEqual(75);
    }
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((line) => line.startsWith(" ")),
    ).toBe(true);
  });

  it("emits a stable complete VEVENT and omits unauthorized location", () => {
    const output = serializeCalendarEvent({
      id: "90000000-0000-4000-8000-000000000001",
      title: "Arsenal, together",
      description: "Bring energy; respect everyone.",
      startsAt: "2026-08-28T18:00:00.000Z",
      endsAt: "2026-08-28T21:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
      location: null,
      url: "https://gethuddle.app/events/90000000-0000-4000-8000-000000000001",
    });

    expect(output).toContain("UID:90000000-0000-4000-8000-000000000001@gethuddle.app");
    expect(output).toContain("SUMMARY:Arsenal\\, together");
    expect(output).not.toContain("LOCATION:");
    expect(output.endsWith("\r\n")).toBe(true);
  });
});
