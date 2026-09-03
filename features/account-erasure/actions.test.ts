import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";

import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
} from "@/features/auth/session-cleanup-cookie";
import { RECOVERY_GRANT_COOKIE_NAME } from "@/features/auth/recovery-grant";
import { WORKSPACE_COOKIE_NAME } from "@/features/workspaces/state";

const mocks = vi.hoisted(() => ({
  adminDeleteUser: vi.fn(),
  cookieGetAll: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getRequestId: vi.fn(),
  getServerEnvironment: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env/server", () => ({ getServerEnvironment: mocks.getServerEnvironment }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { deleteAccountAction } from "./actions";

const userId = "e4000000-0000-4000-8000-000000000281";
const otherUserId = "e4000000-0000-4000-8000-000000000282";
const email = "fan@example.com";
const requestId = "e4000000-0000-4000-8000-000000000280";

function deleteAccountForm(
  values: Readonly<{ currentPassword?: string; confirmation?: string }> = {},
) {
  const formData = new FormData();
  formData.set("currentPassword", values.currentPassword ?? "current-password");
  formData.set("confirmation", values.confirmation ?? "DELETE");
  return formData;
}

describe("deleteAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnvironment.mockReturnValue({ HUDDLE_ENVIRONMENT: "local" });
    mocks.getRequestId.mockResolvedValue(requestId);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId, email } },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: userId, email } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.adminDeleteUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: mocks.getUser,
        signInWithPassword: mocks.signInWithPassword,
      },
      rpc: mocks.rpc,
    });
    mocks.createServiceRoleClient.mockReturnValue({
      auth: { admin: { deleteUser: mocks.adminDeleteUser } },
    });
    mocks.cookieGetAll.mockReturnValue([
      { name: "sb-example-auth-token", value: "session" },
      { name: "sb-example-auth-token.0", value: "chunk" },
      { name: "unrelated-cookie", value: "keep" },
    ]);
    mocks.cookies.mockResolvedValue({
      getAll: mocks.cookieGetAll,
      set: mocks.cookieSet,
    });
  });

  it("rejects invalid confirmation before reading the current session", async () => {
    const result = await deleteAccountAction(null, deleteAccountForm({ confirmation: "delete" }));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { confirmation: ["Type DELETE exactly to confirm."] },
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires a current authenticated user before reauthentication", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(JSON.stringify(result)).not.toContain("private session provider detail");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("keeps a get-user provider failure generic and retryable", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("private session provider detail", 504, "request_timeout"),
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private session provider detail");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a current user without an email credential", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId, email: "" } },
      error: null,
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("maps a wrong current password to one safe field error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("private credential provider detail", 400, "invalid_credentials"),
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email,
      password: "current-password",
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { currentPassword: ["Current password is incorrect."] },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private credential provider detail");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("keeps a reauthentication provider failure generic and retryable", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("private rate provider detail", 429, "over_request_rate_limit"),
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private rate provider detail");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects reauthentication that resolves to a different user", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: otherUserId, email } },
      error: null,
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("stops before Auth deletion when database preparation fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "private database provider detail" },
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(mocks.rpc).toHaveBeenCalledWith("prepare_account_erasure", {
      input_confirmation: "DELETE",
      audit_request_id: requestId,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(result)).not.toContain("private database provider detail");
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
  });

  it("returns a generic retryable error when Auth deletion fails after preparation", async () => {
    mocks.adminDeleteUser.mockResolvedValue({
      data: { user: null },
      error: new Error("private service-role provider detail"),
    });

    const result = await deleteAccountAction(null, deleteAccountForm());

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith(userId, true);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private service-role provider detail");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("retries both idempotent preparation and Auth deletion after provider recovery", async () => {
    mocks.adminDeleteUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error("temporary provider failure"),
      })
      .mockResolvedValueOnce({ data: { user: null }, error: null });

    const firstResult = await deleteAccountAction(null, deleteAccountForm());
    await deleteAccountAction(null, deleteAccountForm());

    expect(firstResult).toMatchObject({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE" } });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.adminDeleteUser).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in?account=deleted");
  });

  it("orders reauthentication, preparation, soft deletion, server-state clearing, and redirect", async () => {
    await deleteAccountAction(null, deleteAccountForm());

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email,
      password: "current-password",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_account_erasure", {
      input_confirmation: "DELETE",
      audit_request_id: requestId,
    });
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith(userId, true);

    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signInWithPassword.mock.invocationCallOrder[0]!,
    );
    expect(mocks.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0]!,
    );
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.adminDeleteUser.mock.invocationCallOrder[0]!,
    );
    expect(mocks.adminDeleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cookieSet.mock.invocationCallOrder[0]!,
    );

    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-example-auth-token", "", {
      maxAge: 0,
      path: "/",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-example-auth-token.0", "", {
      maxAge: 0,
      path: "/",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      RECOVERY_GRANT_COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      WORKSPACE_COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
      HUDDLE_SESSION_CLEANUP_COOKIE_VALUES.accountErasure,
      expect.objectContaining({
        httpOnly: true,
        maxAge: 120,
        path: "/",
        sameSite: "lax",
        secure: false,
      }),
    );
    expect(mocks.cookieSet.mock.calls.map(([name]) => name)).not.toContain("unrelated-cookie");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in?account=deleted");
    expect(mocks.cookieSet.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.revalidatePath.mock.invocationCallOrder[0]!,
    );
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0]!,
    );
  });
});
