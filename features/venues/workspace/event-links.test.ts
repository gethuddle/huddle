import { describe, expect, it } from "vitest";
import { safeVenueEventReturnTo, venueCollectionHref } from "./event-links";

describe("venue history navigation", () => {
  it("preserves only canonical paging state for the current venue", () => {
    expect(
      safeVenueEventReturnTo(
        "/venues/corner/workspace/events?status=draft&page=13#venue-events",
        "corner",
        true,
      ),
    ).toBe("/venues/corner/workspace/events?status=draft&page=13#venue-events");
    expect(venueCollectionHref("corner", "calendar", "completed", 2)).toBe(
      "/venues/corner/workspace/calendar?status=completed&page=2#venue-calendar",
    );
  });

  it.each([
    "/venues/other/workspace/events?status=draft&page=2#venue-events",
    "/venues/corner/workspace/events?next=https://example.com",
    "/venues/corner/workspace/events?status=draft&status=completed",
    "/venues/corner/workspace/events?page=502",
    "/venues/corner/workspace/events#wrong",
  ])("rejects arbitrary return destination %s", (value) => {
    expect(safeVenueEventReturnTo(value, "corner", true)).toBeNull();
  });
});
