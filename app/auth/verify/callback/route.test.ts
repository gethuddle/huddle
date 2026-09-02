import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({ NEXT_PUBLIC_APP_URL: "https://huddle.test" }),
}));

describe("legacy email verification callback", () => {
  it("never consumes a one-time credential on GET or prefetch", async () => {
    const response = await GET();

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/verify?status=expired");
    expect(response.headers.get("location")).not.toContain("secret-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
