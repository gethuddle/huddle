import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
} from "./session-cleanup-cookie";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  getServerEnvironment: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env/server", () => ({ getServerEnvironment: mocks.getServerEnvironment }));

import { consumeHuddleSessionCleanupAction } from "./session-cleanup-actions";

describe("consumeHuddleSessionCleanupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet, set: mocks.cookieSet });
    mocks.getServerEnvironment.mockReturnValue({ HUDDLE_ENVIRONMENT: "local" });
  });

  it("expires the matching HttpOnly cleanup marker after one use", async () => {
    mocks.cookieGet.mockReturnValue({ value: HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut });

    await consumeHuddleSessionCleanupAction("sign-out");

    expect(mocks.cookieGet).toHaveBeenCalledWith(HUDDLE_SESSION_CLEANUP_COOKIE_NAME);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
      "",
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure: false,
      }),
    );
  });

  it("cannot consume a marker for another completion purpose", async () => {
    mocks.cookieGet.mockReturnValue({
      value: HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.accountErasure,
    });

    await consumeHuddleSessionCleanupAction("sign-out");

    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
