import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import active from "@/tests/fixtures/polar/subscription-active.json";
import { billingEnvironment } from "@/tests/fixtures/polar-environment";
import { POST } from "@/app/api/polar/webhooks/route";

import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
} from "@/features/auth/session-cleanup-cookie";
import { RECOVERY_GRANT_COOKIE_NAME } from "@/features/auth/recovery-grant";
import { WORKSPACE_COOKIE_NAME } from "@/features/workspaces/state";

const mocks = vi.hoisted(() => ({
  adminDeleteUser: vi.fn(),
  adminRpc: vi.fn(),
  erasePolarExternalCustomer: vi.fn(),
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
vi.mock("@/features/venue-billing/polar", () => ({
  erasePolarExternalCustomer: mocks.erasePolarExternalCustomer,
}));
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
    mocks.rpc.mockResolvedValue({
      data: [{ prepared: true, polar_cleanup_required: false, cleanup_token: null }],
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({ data: null, error: null });
    mocks.erasePolarExternalCustomer.mockResolvedValue(undefined);
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
      rpc: mocks.adminRpc,
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

    expect(mocks.rpc).toHaveBeenCalledWith("prepare_account_erasure_v2", {
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
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_account_erasure_v2", {
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

  it("anonymizes Polar and completes local cleanup before deleting Auth", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          prepared: true,
          polar_cleanup_required: true,
          cleanup_token: "ea000000-0000-4000-8000-000000000003",
        },
      ],
      error: null,
    });
    await deleteAccountAction(null, deleteAccountForm());
    expect(mocks.erasePolarExternalCustomer).toHaveBeenCalledWith(userId);
    expect(mocks.adminRpc).toHaveBeenCalledWith("complete_polar_account_erasure_cleanup", {
      input_actor_id: userId,
      input_request_id: requestId,
      input_cleanup_token: "ea000000-0000-4000-8000-000000000003",
    });
    expect(mocks.erasePolarExternalCustomer.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.adminRpc.mock.invocationCallOrder[0]!,
    );
    expect(mocks.adminRpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.adminDeleteUser.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps a late customer cleanup retryable when an older external 404 completes afterwards", async () => {
    const oldToken = "ea000000-0000-4000-8000-000000000001";
    const newToken = "ea000000-0000-4000-8000-000000000002";
    let currentToken = oldToken;
    let completed = false;
    const oldDelete = Promise.withResolvers<void>();
    const lateDelete = Promise.withResolvers<void>();
    mocks.getServerEnvironment.mockReturnValue(billingEnvironment());
    mocks.rpc.mockResolvedValue({
      data: [{ prepared: true, polar_cleanup_required: true, cleanup_token: oldToken }],
      error: null,
    });
    mocks.adminRpc.mockImplementation(async (name, args) => {
      if (name === "apply_polar_venue_billing_event") {
        currentToken = newToken;
        return {
          data: [
            {
              outcome: completed ? "erasure_cleanup_complete" : "erasure_cleanup_required",
              cleanup_actor_id: completed ? null : userId,
              cleanup_token: completed ? null : currentToken,
            },
          ],
          error: null,
        };
      }
      if (name === "complete_polar_account_erasure_cleanup") {
        if (args.input_cleanup_token !== currentToken)
          return { data: null, error: { message: "INVALID_TRANSITION" } };
        completed = true;
        return { data: null, error: null };
      }
      throw new Error("Unexpected RPC");
    });
    mocks.erasePolarExternalCustomer
      .mockReturnValueOnce(oldDelete.promise)
      .mockReturnValueOnce(lateDelete.promise)
      .mockResolvedValue(undefined);
    const action = deleteAccountAction(null, deleteAccountForm());
    await vi.waitFor(() => expect(mocks.erasePolarExternalCustomer).toHaveBeenCalledTimes(1));
    const body = JSON.stringify(active);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", billingEnvironment().POLAR_WEBHOOK_SECRET)
      .update(`erasure-race.${timestamp}.${body}`)
      .digest("base64");
    const webhook = () =>
      POST(
        new Request("http://localhost/api/polar/webhooks", {
          method: "POST",
          body,
          headers: {
            "webhook-id": "erasure-race",
            "webhook-timestamp": timestamp,
            "webhook-signature": `v1,${signature}`,
          },
        }),
      );
    const late = webhook();
    await vi.waitFor(() => expect(mocks.erasePolarExternalCustomer).toHaveBeenCalledTimes(2));
    oldDelete.resolve(); // The idempotent provider boundary has accepted a 404.
    expect(await action).toMatchObject({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE" } });
    expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
    expect(completed).toBe(false);
    lateDelete.reject(new Error("temporary external failure"));
    expect((await late).status).toBe(503);
    expect((await webhook()).status).toBe(200);
    expect(completed).toBe(true);
    expect(mocks.erasePolarExternalCustomer).toHaveBeenCalledTimes(3);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "complete_polar_account_erasure_cleanup",
      expect.objectContaining({ input_cleanup_token: newToken }),
    );
  });

  it("skips Polar for a Fan with no cleanup obligation", async () => {
    await deleteAccountAction(null, deleteAccountForm());
    expect(mocks.erasePolarExternalCustomer).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith(userId, true);
  });

  it("retries Auth without repeating completed Polar cleanup", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            prepared: true,
            polar_cleanup_required: true,
            cleanup_token: "ea000000-0000-4000-8000-000000000003",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ prepared: true, polar_cleanup_required: false, cleanup_token: null }],
        error: null,
      });
    mocks.adminDeleteUser
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("Auth unavailable") })
      .mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await deleteAccountAction(null, deleteAccountForm())).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE" },
    });
    await deleteAccountAction(null, deleteAccountForm());
    expect(mocks.erasePolarExternalCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
    expect(mocks.adminDeleteUser).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in?account=deleted");
  });

  it.each([null, [], [{ prepared: false, polar_cleanup_required: false }], true])(
    "rejects an unconfirmed preparation result %j",
    async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect(await deleteAccountAction(null, deleteAccountForm())).toMatchObject({
        ok: false,
        error: { code: "UPSTREAM_UNAVAILABLE" },
      });
      expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
    },
  );

  it.each(["provider", "completion"])(
    "stops Auth deletion when %s cleanup fails",
    async (failure) => {
      mocks.rpc.mockResolvedValue({
        data: [
          {
            prepared: true,
            polar_cleanup_required: true,
            cleanup_token: "ea000000-0000-4000-8000-000000000003",
          },
        ],
        error: null,
      });
      if (failure === "provider")
        mocks.erasePolarExternalCustomer.mockRejectedValue(new Error("private Polar timeout"));
      else
        mocks.adminRpc.mockResolvedValue({
          data: null,
          error: { message: "private cleanup failure" },
        });
      const result = await deleteAccountAction(null, deleteAccountForm());
      expect(result).toMatchObject({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE" } });
      expect(JSON.stringify(result)).not.toContain("private");
      expect(mocks.adminDeleteUser).not.toHaveBeenCalled();
    },
  );
});
