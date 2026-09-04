import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { consumeAuthLink } from "./link-consumption-server";
const actor = "70000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  verifyOtp: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://huddle.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    AUTH_RECOVERY_TOKEN_SECRET: "r".repeat(32),
    HUDDLE_ENVIRONMENT: "local",
  }),
}));
function request(
  body = "token_hash=secret&type=email_change",
  origin = "https://huddle.test",
  cookie = "",
) {
  return new NextRequest("https://huddle.test/auth/email-change/confirm/consume", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", origin, cookie },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: actor, session_id: "70000000-0000-4000-8000-000000000002" } },
    error: null,
  });
  mocks.createServerClient.mockImplementation((_url, _key, { cookies }) => ({
    auth: {
      verifyOtp: async (input: unknown) => {
        const result = await mocks.verifyOtp(input);
        if (result.data.session !== null)
          cookies.setAll([{ name: "sb-auth", value: "new-session", options: { path: "/" } }], {});
        return result;
      },
      signOut: mocks.signOut,
      getClaims: mocks.getClaims,
    },
    rpc: mocks.rpc,
  }));
});
it("accepts the first dual-email confirmation as pending without granting an authenticated session", async () => {
  const response = await consumeAuthLink(request(), "email_change");
  expect(response.headers.get("location")).toBe(
    "https://huddle.test/auth/email-change?status=received",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.cookies.get("sb-auth")).toBeUndefined();
  expect(mocks.getClaims).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("verifies final identity then clears the link session instead of signing in or granting recovery", async () => {
  mocks.verifyOtp.mockResolvedValue({
    data: { user: { id: actor }, session: { access_token: "verified-jwt" } },
    error: null,
  });
  const response = await consumeAuthLink(
    request(undefined, undefined, "sb-old=ambient-other-user"),
    "email_change",
  );
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.verifyOtp.mock.invocationCallOrder[0]!,
  );
  expect(mocks.getClaims).toHaveBeenCalledWith("verified-jwt");
  expect(response.headers.get("location")).toBe(
    "https://huddle.test/auth/email-change?status=received",
  );
  expect(response.cookies.get("sb-auth")?.value).toBe("");
  expect(response.cookies.get("sb-old")?.value).toBe("");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  "token_hash=secret&type=email",
  "token_hash=secret&type=recovery",
  "code=opaque",
  "token_hash=a&type=email_change&token_hash=b",
])("rejects wrong or ambiguous purpose %s before provider access", async (body) => {
  const response = await consumeAuthLink(request(body), "email_change");
  expect(response.headers.get("location")).toContain("status=expired");
  expect(mocks.createServerClient).not.toHaveBeenCalled();
});
it("rejects cross-origin, expired tokens and final identity mismatch without exposing provider details", async () => {
  await consumeAuthLink(request(undefined, "https://attacker.test"), "email_change");
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
  mocks.verifyOtp.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: { message: "secret internal detail" },
  });
  expect((await consumeAuthLink(request(), "email_change")).headers.get("location")).toBe(
    "https://huddle.test/auth/email-change?status=expired",
  );
  mocks.verifyOtp.mockResolvedValue({
    data: { user: { id: "different" }, session: { access_token: "jwt" } },
    error: null,
  });
  const mismatch = await consumeAuthLink(request(), "email_change");
  expect(mismatch.headers.get("location")).toContain("status=expired");
  expect(mismatch.cookies.get("sb-auth")?.value).toBe("");
  expect(mismatch.cookies.get("huddle-session-cleanup")?.value).toBe("sign-out");
});
