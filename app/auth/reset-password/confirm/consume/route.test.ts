import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RECOVERY_GRANT_COOKIE_NAME, verifyRecoveryGrant } from "@/features/auth/recovery-grant";

import { POST } from "./route";

type CookieAdapter = Readonly<{
  setAll: (
    cookies: ReadonlyArray<{ name: string; value: string; options?: Record<string, unknown> }>,
    headers: Readonly<Record<string, string>>,
  ) => void;
}>;

const USER_ID = "e4000000-0000-4000-8000-000000000201";
const SESSION_ID = "e4000000-0000-4000-8000-000000000202";
const SECRET = "r".repeat(32);

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getClaims: vi.fn(),
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

function request(body: string, origin = "https://huddle.test") {
  return new NextRequest("https://huddle.test/auth/reset-password/confirm", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
  });
}

describe("password recovery POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, session_id: SESSION_ID } },
      error: null,
    });
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { access_token: "recovery-jwt" }, user: { id: USER_ID } },
      error: null,
    });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        session: { access_token: "recovery-jwt" },
        user: { id: USER_ID },
        redirectType: "recovery",
      },
      error: null,
    });
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      const cookieAdapter = options.cookies as CookieAdapter;
      const exchangeCodeForSession = async (code: string) => {
        const result = await mocks.exchangeCodeForSession(code);
        if (result.data.session !== null) {
          cookieAdapter.setAll(
            [
              { name: "sb-example-auth-token.0", value: "pkce-session-0", options: { path: "/" } },
              { name: "sb-example-auth-token.1", value: "pkce-session-1", options: { path: "/" } },
            ],
            {},
          );
        }
        return result;
      };
      mocks.signOut.mockImplementation(async () => {
        cookieAdapter.setAll([{ name: "sb-auth", value: "", options: { maxAge: 0 } }], {});
        return { error: null };
      });
      mocks.verifyOtp.mockImplementationOnce(async () => {
        cookieAdapter.setAll([{ name: "sb-auth", value: "recovery-session" }], {});
        return {
          data: { session: { access_token: "recovery-jwt" }, user: { id: USER_ID } },
          error: null,
        };
      });
      return {
        auth: {
          exchangeCodeForSession,
          getClaims: mocks.getClaims,
          signOut: mocks.signOut,
          verifyOtp: mocks.verifyOtp,
        },
        rpc: vi.fn(),
      };
    });
  });

  it("binds a five-minute HMAC grant to the verified recovery session", async () => {
    const response = await POST(request("token_hash=secret-recovery&type=recovery"));

    expect(response.headers.get("location")).toBe("https://huddle.test/auth/reset-password");
    expect(response.headers.get("location")).not.toContain("secret-recovery");
    const token = response.cookies.get("huddle-password-recovery")?.value;
    expect(token).toBeDefined();
    expect(() =>
      verifyRecoveryGrant(token!, { userId: USER_ID, sessionId: SESSION_ID }, SECRET),
    ).not.toThrow();
    expect(response.cookies.get("huddle-workspace")?.value).toBe("");
  });

  it("fails indistinguishably when claims do not bind a valid session", async () => {
    mocks.getClaims.mockResolvedValueOnce({ data: { claims: { sub: USER_ID } }, error: null });

    const response = await POST(request("token_hash=secret-recovery&type=recovery"));

    expect(response.headers.get("location")).toBe(
      "https://huddle.test/auth/forgot-password?status=expired",
    );
    expect(response.cookies.get("huddle-password-recovery")).toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.cookies.get("sb-auth")?.value).toBe("");
  });

  it("rejects a non-recovery PKCE code before issuing a recovery grant", async () => {
    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "ordinary-jwt" },
        user: { id: USER_ID },
        redirectType: null,
      },
      error: null,
    });
    mocks.signOut.mockRejectedValueOnce(new Error("provider cleanup unavailable"));

    const response = await POST(request("code=ordinary-signup-code"));

    expect(response.headers.get("location")).toBe(
      "https://huddle.test/auth/forgot-password?status=expired",
    );
    expect(response.cookies.get(RECOVERY_GRANT_COOKIE_NAME)).toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.cookies.get("sb-example-auth-token.0")).toMatchObject({
      maxAge: 0,
      path: "/",
      value: "",
    });
    expect(response.cookies.get("sb-example-auth-token.1")).toMatchObject({
      maxAge: 0,
      path: "/",
      value: "",
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a cross-origin POST without contacting Supabase", async () => {
    const response = await POST(
      request("token_hash=secret-recovery&type=recovery", "https://attacker.example"),
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("status=expired");
  });
});
