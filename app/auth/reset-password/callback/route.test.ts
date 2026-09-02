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

describe("password-recovery callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      const cookies = options.cookies as CookieAdapter;
      mocks.verifyOtp.mockImplementation(async () => {
        cookies.setAll(
          [
            {
              name: "sb-example-auth-token",
              value: "recovery-session",
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
              value: "recovery-pkce-session",
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

  it("verifies a recovery token hash and strips it before showing the password form", async () => {
    const response = await GET(
      new NextRequest(
        "https://attacker.example/auth/reset-password/callback?token_hash=secret-recovery-hash&type=recovery",
      ),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "secret-recovery-hash",
      type: "recovery",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/reset-password");
    expect(response.headers.get("location")).not.toContain("secret-recovery-hash");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe("recovery-session");
  });

  it("exchanges one PKCE code and never carries it into the password form URL", async () => {
    const response = await GET(
      new NextRequest("https://huddle.test/auth/reset-password/callback?code=secret-recovery-code"),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("secret-recovery-code");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://huddle.test/auth/reset-password");
    expect(response.headers.get("location")).not.toContain("secret-recovery-code");
  });

  it.each([
    "?token_hash=hash&type=email",
    "?token_hash=hash&type=recovery&code=code",
    "?type=recovery",
  ])(
    "rejects malformed or ambiguous callback input %s before contacting Supabase",
    async (query) => {
      const response = await GET(
        new NextRequest(`https://huddle.test/auth/reset-password/callback${query}`),
      );

      expect(mocks.createServerClient).not.toHaveBeenCalled();
      expect(response.headers.get("location")).toBe(
        "https://huddle.test/auth/forgot-password?status=expired",
      );
    },
  );

  it("uses the same expired-link destination when Supabase rejects the credential", async () => {
    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new Error("code expired at provider"),
    });

    const response = await GET(
      new NextRequest("https://huddle.test/auth/reset-password/callback?code=expired-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://huddle.test/auth/forgot-password?status=expired",
    );
    expect(response.headers.get("location")).not.toContain("expired-code");
  });
});
