import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

type CookieAdapter = Readonly<{
  setAll: (
    cookies: ReadonlyArray<{
      name: string;
      value: string;
      options?: Readonly<{ httpOnly?: boolean }>;
    }>,
    headers: Readonly<Record<string, string>>,
  ) => void;
}>;

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    NEXT_PUBLIC_APP_URL: "https://huddle.test",
  }),
}));

describe("email verification callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      const cookies = options.cookies as CookieAdapter;
      mocks.verifyOtp.mockImplementation(async () => {
        cookies.setAll(
          [
            {
              name: "sb-example-auth-token",
              value: "verified-session",
              options: { httpOnly: true },
            },
          ],
          { "Cache-Control": "private, no-store", Pragma: "no-cache" },
        );
        return { data: {}, error: null };
      });
      mocks.exchangeCodeForSession.mockImplementation(async () => {
        cookies.setAll(
          [
            {
              name: "sb-example-auth-token",
              value: "verified-pkce-session",
              options: { httpOnly: true },
            },
          ],
          { "Cache-Control": "private, no-store", Pragma: "no-cache" },
        );
        return { data: {}, error: null };
      });
      return {
        auth: {
          exchangeCodeForSession: mocks.exchangeCodeForSession,
          verifyOtp: mocks.verifyOtp,
        },
      };
    });
  });

  it("verifies only the email token hash and redirects without carrying the token forward", async () => {
    const response = await GET(
      new NextRequest(
        "https://huddle.test/auth/verify/callback?token_hash=secret-token-hash&type=email",
      ),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "secret-token-hash",
      type: "email",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/verify?status=success");
    expect(response.headers.get("location")).not.toContain("secret-token-hash");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe("verified-session");
  });

  it("exchanges a default-template PKCE code and redirects without carrying it forward", async () => {
    const response = await GET(
      new NextRequest("https://huddle.test/auth/verify/callback?code=secret-auth-code"),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("secret-auth-code");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/verify?status=success");
    expect(response.headers.get("location")).not.toContain("secret-auth-code");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe("verified-pkce-session");
  });

  it("rejects other OTP types before contacting Supabase", async () => {
    const response = await GET(
      new NextRequest(
        "https://attacker.example/auth/verify/callback?token_hash=secret-token-hash&type=recovery",
      ),
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/verify?status=expired");
    expect(response.headers.get("location")).not.toContain("secret-token-hash");
  });

  it("rejects ambiguous callbacks before contacting Supabase", async () => {
    const response = await GET(
      new NextRequest(
        "https://huddle.test/auth/verify/callback?token_hash=secret-token-hash&type=email&code=secret-auth-code",
      ),
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/verify?status=expired");
  });
});
