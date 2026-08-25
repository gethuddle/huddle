import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_ID_HEADER } from "@/lib/request-id";

import { refreshSession } from "./session";

type CookieOptions = Readonly<{
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
}>;

type CookieAdapter = Readonly<{
  getAll: () => unknown[];
  setAll: (
    cookies: ReadonlyArray<{
      name: string;
      value: string;
      options?: CookieOptions;
    }>,
    headers: Readonly<Record<string, string>>,
  ) => void;
}>;

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

describe("session refresh Proxy boundary", () => {
  let cookieAdapter: CookieAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      cookieAdapter = options.cookies as CookieAdapter;
      return { auth: { getClaims: mocks.getClaims } };
    });
    mocks.getClaims.mockImplementation(async () => {
      cookieAdapter.setAll(
        [
          {
            name: "sb-example-auth-token",
            value: "refreshed-cookie-value",
            options: { httpOnly: true, sameSite: "lax" },
          },
        ],
        {
          "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          Expires: "0",
          Pragma: "no-cache",
        },
      );
      return { data: null, error: null };
    });
  });

  it("validates claims, mirrors refreshed cookies, and propagates the request ID", async () => {
    const requestId = "7af34324-188e-4d88-86f0-4844283835de";
    const request = new NextRequest("https://huddle.test/dashboard", {
      headers: { [REQUEST_ID_HEADER]: requestId },
    });

    const response = await refreshSession(request);

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    expect(response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`)).toBe(requestId);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.cookies.get("sb-example-auth-token")).toMatchObject({
      name: "sb-example-auth-token",
      value: "refreshed-cookie-value",
    });
    expect(request.cookies.get("sb-example-auth-token")).toMatchObject({
      name: "sb-example-auth-token",
      value: "refreshed-cookie-value",
    });
  });

  it("performs no authorization redirect", async () => {
    const response = await refreshSession(new NextRequest("https://huddle.test/private"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
