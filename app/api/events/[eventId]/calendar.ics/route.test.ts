import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getCalendarEvent: vi.fn() }));
vi.mock("@/features/attendance/queries", () => ({ getCalendarEvent: mocks.getCalendarEvent }));

const eventId = "90000000-0000-4000-8000-000000000001";
const publicCalendarEvent = {
  event_id: eventId,
  title: "Match huddle",
  description: "Watch together.",
  starts_at: "2026-09-01T18:00:00.000Z",
  ends_at: "2026-09-01T21:00:00.000Z",
  updated_at: "2026-08-28T12:00:00.000Z",
  location_text: "12 Public Street, Haifa",
  public_cacheable: true,
};

function request() {
  return new NextRequest(`https://gethuddle.app/api/events/${eventId}/calendar.ics`);
}

describe("GET event calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCalendarEvent.mockResolvedValue(publicCalendarEvent);
  });

  it("returns an RFC calendar attachment with short public caching for venue events", async () => {
    const response = await GET(request(), { params: Promise.resolve({ eventId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(eventId);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(await response.text()).toContain("LOCATION:12 Public Street\\, Haifa");
  });

  it("never shared-caches private event calendars", async () => {
    mocks.getCalendarEvent.mockResolvedValue({
      ...publicCalendarEvent,
      public_cacheable: false,
    });
    const response = await GET(request(), { params: Promise.resolve({ eventId }) });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a safe no-store denial without leaking location details", async () => {
    mocks.getCalendarEvent.mockRejectedValue(
      new DomainError("LOCATION_NOT_AUTHORIZED", { cause: new Error("private address") }),
    );
    const response = await GET(request(), { params: Promise.resolve({ eventId }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("private address");
  });
});
