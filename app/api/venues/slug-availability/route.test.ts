import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import { GET } from "./route";

const venueId = "e4000000-0000-4000-8000-000000000101";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.actor }));

beforeEach(() => {
  mocks.actor.mockReset();
  mocks.rpc.mockReset();
  mocks.actor.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
});

it("authorizes the exact venue and returns only an advisory no-store availability boolean", async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const response = await GET(
    new NextRequest(
      `https://huddle.test/api/venues/slug-availability?venueId=${venueId}&slug=new-corner`,
    ),
  );

  expect(mocks.actor).toHaveBeenCalledWith({ venueId });
  expect(mocks.rpc).toHaveBeenCalledWith("is_venue_slug_available", {
    input_slug: "new-corner",
    input_venue_id: venueId,
  });
  expect(await response.json()).toEqual({ available: true });
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("rejects expanded or malformed input before authorization", async () => {
  const response = await GET(
    new NextRequest(
      `https://huddle.test/api/venues/slug-availability?venueId=${venueId}&slug=no!&x=1`,
    ),
  );

  expect(response.status).toBe(400);
  expect(mocks.actor).not.toHaveBeenCalled();
});
