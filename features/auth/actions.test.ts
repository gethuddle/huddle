import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";

import {
  changePasswordAction,
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction,
} from "./actions";
import { issueRecoveryGrant, RECOVERY_GRANT_COOKIE_NAME } from "./recovery-grant";
import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
} from "./session-cleanup-cookie";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieGetAll: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  getServerEnvironment: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  rpc: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies, headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://huddle.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  }),
}));
vi.mock("@/lib/env/server", () => ({ getServerEnvironment: mocks.getServerEnvironment }));
vi.mock("@/features/auth/turnstile", () => ({
  verifyTurnstileToken: mocks.verifyTurnstileToken,
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
    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      getAll: mocks.cookieGetAll,
      set: mocks.cookieSet,
    });
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
    mocks.getServerEnvironment.mockReturnValue({
      AUTH_RECOVERY_TOKEN_SECRET: "r".repeat(32),
      AUTH_TURNSTILE_ENABLED: false,
      HUDDLE_ENVIRONMENT: "local",
    });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookieGetAll.mockReturnValue([
      { name: "sb-example-auth-token", value: "session" },
      { name: "sb-example-auth-token.0", value: "chunk" },
      { name: "unrelated-cookie", value: "keep" },
    ]);
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: mocks.getClaims,
        getUser: mocks.getUser,
        resetPasswordForEmail: mocks.resetPasswordForEmail,
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
        signUp: mocks.signUp,
        updateUser: mocks.updateUser,
      },
      rpc: mocks.rpc,
    });
  });

  it("fails closed before signup when enabled Turnstile verification fails", async () => {
    mocks.getServerEnvironment.mockReturnValue({
      AUTH_TURNSTILE_ENABLED: true,
      TURNSTILE_SECRET: "turnstile-secret",
      TURNSTILE_HOSTNAMES: "huddle.co.il",
    });
    mocks.verifyTurnstileToken.mockRejectedValue(
      new Error("Please complete the security check and try again."),
    );

    const result = await signUpAction(
      null,
      formData({
        email: "fan@example.com",
        password: "matchday-strong",
        confirmPassword: "matchday-strong",
        "cf-turnstile-response": "failed-token",
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("uses a stable Turnstile action and the first forwarded IP for each public auth form", async () => {
    mocks.getServerEnvironment.mockReturnValue({
      AUTH_TURNSTILE_ENABLED: true,
      TURNSTILE_SECRET: "turnstile-secret",
      TURNSTILE_HOSTNAMES: "huddle.co.il",
    });
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
    mocks.signUp.mockResolvedValue({ data: { user: null }, error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error("bad credentials"),
    });

    await signUpAction(
      null,
      formData({
        email: "fan@example.com",
        password: "matchday-strong",
        confirmPassword: "matchday-strong",
        "cf-turnstile-response": "signup-token",
      }),
    );
    await signInAction(
      null,
      formData({
        email: "fan@example.com",
        password: "old-pass",
        "cf-turnstile-response": "login-token",
      }),
    );
    await requestPasswordResetAction(
      null,
      formData({
        email: "fan@example.com",
        "cf-turnstile-response": "reset-token",
      }),
    );

    expect(mocks.verifyTurnstileToken).toHaveBeenNthCalledWith(1, {
      expectedAction: "signup",
      expectedHostnames: "huddle.co.il",
      remoteIp: "203.0.113.9",
      secret: "turnstile-secret",
      token: "signup-token",
    });
    expect(mocks.verifyTurnstileToken).toHaveBeenNthCalledWith(2, {
      expectedAction: "login",
      expectedHostnames: "huddle.co.il",
      remoteIp: "203.0.113.9",
      secret: "turnstile-secret",
      token: "login-token",
    });
    expect(mocks.verifyTurnstileToken).toHaveBeenNthCalledWith(3, {
      expectedAction: "password_reset",
      expectedHostnames: "huddle.co.il",
      remoteIp: "203.0.113.9",
      secret: "turnstile-secret",
      token: "reset-token",
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
        emailRedirectTo: "https://huddle.test/auth/verify/confirm",
      },
      password: "matchday-strong",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message: "If that address can receive Huddle mail, a verification link is on its way.",
        redirectTo: "/auth/verify",
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

    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/auth/verify" } });
    expect(JSON.stringify(result)).not.toContain("network lookup failed");
  });

  it("maps invalid credentials to one generic public error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("User not found in auth.users", 400, "invalid_credentials"),
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

  it("maps a returned sign-in provider failure to the controlled service error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("private rate detail", 429, "over_request_rate_limit"),
    });

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
    expect(JSON.stringify(result)).not.toContain("private rate detail");
  });

  it("maps a returned retryable fetch error to the controlled service error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthRetryableFetchError("private network detail", 0),
    });

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
    expect(JSON.stringify(result)).not.toContain("private network detail");
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

  it("returns an active Fan to a safe invite path after sign-in", async () => {
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
      formData({
        email: "fan@example.com",
        password: "matchday-strong",
        next: `/join/event/${"a".repeat(43)}`,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { redirectTo: `/join/event/${"a".repeat(43)}` },
    });
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

  it("clears only the current browser session and marks the hard sign-out redirect", async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    await signOutAction(null, new FormData());

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-example-auth-token", "", {
      maxAge: 0,
      path: "/",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-example-auth-token.0", "", {
      maxAge: 0,
      path: "/",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
      HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut,
      expect.objectContaining({
        httpOnly: true,
        maxAge: 120,
        path: "/",
        sameSite: "lax",
        secure: false,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("finishes local sign-out cleanup when the provider logout request fails", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("private logout transport detail") });

    await signOutAction(null, new FormData());

    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-example-auth-token", "", {
      maxAge: 0,
      path: "/",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      RECOVERY_GRANT_COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, path: "/" }),
    );
    expect(mocks.cookieSet.mock.calls.map(([name]) => name)).not.toContain("unrelated-cookie");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
      HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut,
      expect.objectContaining({ httpOnly: true, maxAge: 120, path: "/" }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("requests a recovery email through the dedicated callback and never exposes identity state", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: new Error("User not found"),
    });

    const result = await requestPasswordResetAction(null, formData({ email: " Fan@Example.com " }));

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("fan@example.com", {
      redirectTo: "https://huddle.test/auth/reset-password/confirm",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message: "If that address can receive Huddle mail, a password reset link is on its way.",
        redirectTo: "/auth/forgot-password?status=sent",
      },
    });
    expect(JSON.stringify(result)).not.toContain("User not found");
  });

  it("keeps the recovery-request response identical during an upstream failure", async () => {
    mocks.resetPasswordForEmail.mockRejectedValue(new Error("private transport detail"));

    const result = await requestPasswordResetAction(null, formData({ email: "fan@example.com" }));

    expect(result).toMatchObject({
      ok: true,
      data: { redirectTo: "/auth/forgot-password?status=sent" },
    });
    expect(JSON.stringify(result)).not.toContain("private transport detail");
  });

  it("rejects a password update from an ordinary authenticated session", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "e4000000-0000-4000-8000-000000000301",
          session_id: "e4000000-0000-4000-8000-000000000302",
        },
      },
      error: null,
    });

    const result = await updatePasswordAction(
      null,
      formData({
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a recovery grant bound to another session", async () => {
    const userId = "e4000000-0000-4000-8000-000000000301";
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, session_id: "e4000000-0000-4000-8000-000000000302" } },
      error: null,
    });
    mocks.cookieGet.mockImplementation((name: string) =>
      name === RECOVERY_GRANT_COOKIE_NAME
        ? {
            value: issueRecoveryGrant(
              { userId, sessionId: "e4000000-0000-4000-8000-000000000399" },
              "r".repeat(32),
            ),
          }
        : undefined,
    );

    const result = await updatePasswordAction(
      null,
      formData({
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password only with a bound grant, clears state, and globally signs out", async () => {
    const userId = "e4000000-0000-4000-8000-000000000301";
    const sessionId = "e4000000-0000-4000-8000-000000000302";
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, session_id: sessionId } },
      error: null,
    });
    mocks.cookieGet.mockImplementation((name: string) =>
      name === RECOVERY_GRANT_COOKIE_NAME
        ? { value: issueRecoveryGrant({ userId, sessionId }, "r".repeat(32)) }
        : undefined,
    );
    mocks.updateUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    await updatePasswordAction(
      null,
      formData({
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-matchday-password" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      RECOVERY_GRANT_COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, sameSite: "lax" }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in?password=changed");
  });

  it("finishes local recovery cleanup when global session revocation is unconfirmed", async () => {
    const userId = "e4000000-0000-4000-8000-000000000301";
    const sessionId = "e4000000-0000-4000-8000-000000000302";
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, session_id: sessionId } },
      error: null,
    });
    mocks.cookieGet.mockImplementation((name: string) =>
      name === RECOVERY_GRANT_COOKIE_NAME
        ? { value: issueRecoveryGrant({ userId, sessionId }, "r".repeat(32)) }
        : undefined,
    );
    mocks.updateUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.signOut.mockResolvedValue({ error: new Error("private global logout failure") });

    await updatePasswordAction(
      null,
      formData({
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-example-auth-token", "", {
      maxAge: 0,
      path: "/",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
      HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut,
      expect.objectContaining({ httpOnly: true, maxAge: 120, path: "/" }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth/sign-in?password=changed&sessions=unconfirmed",
    );
  });

  it("maps a wrong current password to the highlighted field", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user", email: "fan@example.com" } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("provider detail", 400, "invalid_credentials"),
    });

    const result = await changePasswordAction(
      null,
      formData({
        currentPassword: "wrong-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { currentPassword: ["Current password is incorrect."] },
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider detail");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("distinguishes a missing current session from a get-user provider failure", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    const missingSession = await changePasswordAction(
      null,
      formData({
        currentPassword: "current-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError("private get-user timeout", 504, "request_timeout"),
    });

    const providerFailure = await changePasswordAction(
      null,
      formData({
        currentPassword: "current-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(missingSession).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(providerFailure).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
      },
    });
    expect(JSON.stringify(providerFailure)).not.toContain("private get-user timeout");
  });

  it("keeps a current-password provider failure generic and retryable", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user", email: "fan@example.com" } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("private timeout detail", 504, "request_timeout"),
    });

    const result = await changePasswordAction(
      null,
      formData({
        currentPassword: "current-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private timeout detail");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects reauthentication that resolves to another user", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user", email: "fan@example.com" } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "another-user" }, session: {} },
      error: null,
    });

    const result = await changePasswordAction(
      null,
      formData({
        currentPassword: "current-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("reauthenticates before changing a known password and globally signs out", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user", email: "fan@example.com" } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user" }, session: {} },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    await changePasswordAction(
      null,
      formData({
        currentPassword: "current-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "fan@example.com",
      password: "current-password",
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      current_password: "current-password",
      password: "new-matchday-password",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in?password=changed");
  });

  it("finishes local known-password cleanup when global session revocation throws", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user", email: "fan@example.com" } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user" }, session: {} },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    mocks.signOut.mockRejectedValue(new Error("private global logout transport failure"));

    await changePasswordAction(
      null,
      formData({
        currentPassword: "current-password",
        password: "new-matchday-password",
        confirmPassword: "new-matchday-password",
      }),
    );

    expect(mocks.cookieSet).toHaveBeenCalledWith(
      HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
      HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.signOut,
      expect.objectContaining({ httpOnly: true, maxAge: 120, path: "/" }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth/sign-in?password=changed&sessions=unconfirmed",
    );
  });
});
