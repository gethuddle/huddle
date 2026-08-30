import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInAction, signOutAction, signUpAction } from "./actions";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://huddle.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

function formData(values: Readonly<Record<string, string>>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe("auth Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet, set: mocks.cookieSet });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
        signUp: mocks.signUp,
      },
      rpc: mocks.rpc,
    });
  });

  it("rejects invalid signup input before creating a Supabase client", async () => {
    const result = await signUpAction(
      null,
      formData({
        email: "bad-email",
        password: "short",
        confirmPassword: "different",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns the same signup success contract without exposing identity state", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null },
      error: new Error("User already registered"),
    });

    const result = await signUpAction(
      null,
      formData({
        email: "Fan@Example.com",
        password: "matchday-strong",
        confirmPassword: "matchday-strong",
      }),
    );

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "fan@example.com",
      options: {
        emailRedirectTo: "https://huddle.test/auth/verify/callback",
      },
      password: "matchday-strong",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message: "If that address can receive Huddle mail, a verification link is on its way.",
        redirectTo: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain("already registered");
  });

  it("keeps the signup response non-enumerating when Auth is temporarily unavailable", async () => {
    mocks.signUp.mockRejectedValue(new Error("network lookup failed"));

    const result = await signUpAction(
      null,
      formData({
        email: "fan@example.com",
        password: "matchday-strong",
        confirmPassword: "matchday-strong",
      }),
    );

    expect(result).toMatchObject({ ok: true, data: { redirectTo: null } });
    expect(JSON.stringify(result)).not.toContain("network lookup failed");
  });

  it("maps every credential failure to one generic public error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error("User not found in auth.users"),
    });

    const result = await signInAction(
      null,
      formData({ email: "fan@example.com", password: "matchday-strong" }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_FAILED",
        message: "The email or password is incorrect.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("auth.users");
  });

  it("maps a sign-in transport failure to the controlled service error", async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error("socket details"));

    const result = await signInAction(
      null,
      formData({ email: "fan@example.com", password: "matchday-strong" }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("socket details");
  });

  it("sends a verified account with no workspace to setup", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: "incomplete-user-id" } },
      error: null,
    });

    const result = await signInAction(
      null,
      formData({ email: "fan@example.com", password: "matchday-strong" }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        message: "Signed in. Choose how you’ll use Huddle…",
        redirectTo: "/onboarding",
      },
    });
  });

  it("returns a Fan account to Fan Home", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: "complete-user-id" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          workspace_kind: "fan",
          workspace_id: "e4000000-0000-4000-8000-000000000101",
          slug: "complete_fan",
          name: "Complete Fan",
          role: "fan",
        },
      ],
      error: null,
    });

    const result = await signInAction(
      null,
      formData({ email: "fan@example.com", password: "matchday-strong" }),
    );

    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/" } });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      "fan:e4000000-0000-4000-8000-000000000101",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns a Venue-only account to its authorized Today page", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: "venue-user-id" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          workspace_kind: "venue",
          workspace_id: "e4000000-0000-4000-8000-000000000102",
          slug: "match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ],
      error: null,
    });

    const result = await signInAction(
      null,
      formData({ email: "venue@example.com", password: "matchday-strong" }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { redirectTo: "/venues/match-corner/workspace" },
    });
  });

  it("clears only the current browser session before returning a hard-navigation target", async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    const result = await signOutAction(null, new FormData());

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/" } });
  });
});
