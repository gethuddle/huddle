import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
beforeEach(() => mocks.rpc.mockReset());
it("validates exact input and exposes only a no-store availability boolean", async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const response = await GET(
    new NextRequest("https://huddle.test/api/profiles/handle-availability?handle=Fan_ONE"),
  );
  expect(mocks.rpc).toHaveBeenCalledWith("is_profile_handle_available", {
    input_handle: "fan_one",
  });
  expect(await response.json()).toEqual({ available: true });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each(["handle=a", "handle=fan_one&handle=other", "handle=fan_one&email=secret"])(
  "rejects invalid or expanded requests %s before RPC",
  async (query) => {
    const response = await GET(
      new NextRequest(`https://huddle.test/api/profiles/handle-availability?${query}`),
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it("does not turn authorization errors or malformed DTOs into availability", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: null, error: { message: "AUTH_REQUIRED" } })
    .mockResolvedValueOnce({ data: { email: "private" }, error: null });
  for (let i = 0; i < 2; i++) {
    const response = await GET(
      new NextRequest("https://huddle.test/api/profiles/handle-availability?handle=fan_one"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Username availability is temporarily unavailable.",
    });
  }
});
