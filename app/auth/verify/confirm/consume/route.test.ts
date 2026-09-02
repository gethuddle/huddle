import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

type CookieAdapter = Readonly<{
  setAll: (
    cookies: ReadonlyArray<{ name: string; value: string; options?: Record<string, unknown> }>,
    headers: Readonly<Record<string, string>>,
  ) => void;
}>;

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getClaims: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://huddle.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    AUTH_RECOVERY_TOKEN_SECRET: "r".repeat(32),
    HUDDLE_ENVIRONMENT: "local",
  }),
}));

function request(body: string, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("https://huddle.test/auth/verify/confirm", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://huddle.test",
      ...extraHeaders,
    },
  });
}

describe("email verification POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { access_token: "verified-jwt" }, user: { id: "verified-user" } },
      error: null,
    });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "verified-jwt" }, user: { id: "verified-user" } },
      error: null,
    });
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      const cookieAdapter = options.cookies as CookieAdapter;
      mocks.verifyOtp.mockImplementationOnce(async () => {
        cookieAdapter.setAll([{ name: "sb-auth", value: "verified-session" }], {});
        return {
          data: { session: { access_token: "verified-jwt" }, user: { id: "verified-user" } },
          error: null,
        };
      });
      return {
        auth: {
          exchangeCodeForSession: mocks.exchangeCodeForSession,
          getClaims: mocks.getClaims,
          signOut: mocks.signOut,
          verifyOtp: mocks.verifyOtp,
        },
        rpc: mocks.rpc,
      };
    });
  });

  it("consumes one credential only after same-origin POST and never redirects with it", async () => {
    const response = await POST(request("token_hash=secret-token&type=email"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "secret-token", type: "email" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://huddle.test/onboarding");
    expect(response.headers.get("location")).not.toContain("secret-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.cookies.get("sb-auth")?.value).toBe("verified-session");
  });

  it("locally signs out an ambient account before verifying the link account", async () => {
    await POST(request("code=secure-code", { cookie: "sb-example-auth-token=ambient" }));

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.exchangeCodeForSession.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects cross-origin and ambiguous POSTs before constructing Supabase", async () => {
    const crossOrigin = await POST(
      request("token_hash=secret-token&type=email", { origin: "https://attacker.example" }),
    );
    const ambiguous = await POST(request("token_hash=secret&type=email&code=other"));

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(crossOrigin.headers.get("location")).toContain("status=expired");
    expect(ambiguous.headers.get("location")).toContain("status=expired");
  });

  it.each([undefined, "1"])(
    "rejects an oversized streamed body with declared length %s before form parsing",
    async (declaredLength) => {
      const oversized = request(
        `token_hash=secret-token&type=email&padding=${"x".repeat(8 * 1024)}`,
        declaredLength === undefined ? {} : { "content-length": declaredLength },
      );
      if (declaredLength === undefined) oversized.headers.delete("content-length");
      const formData = vi.spyOn(oversized, "formData");

      const response = await POST(oversized);

      expect(formData).not.toHaveBeenCalled();
      expect(mocks.createServerClient).not.toHaveBeenCalled();
      expect(response.headers.get("location")).toContain("status=expired");
    },
  );
});
