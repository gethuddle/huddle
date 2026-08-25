import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInAction, signOutAction, signUpAction } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

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
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
        signUp: mocks.signUp,
      },
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

  it("clears only the current browser session before returning a hard-navigation target", async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    const result = await signOutAction(null, new FormData());

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/" } });
  });
});
