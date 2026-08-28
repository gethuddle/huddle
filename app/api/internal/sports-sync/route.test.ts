import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  anonymousRpc: vi.fn(),
  createAnonymousServerClient: vi.fn(),
  createProvider: vi.fn(),
  createServiceRoleClient: vi.fn(),
  runSportsSync: vi.fn(),
  safeLog: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    NEXT_PUBLIC_APP_URL: "https://huddle.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    FOOTBALL_DATA_API_TOKEN: "provider-token",
    SPORTS_SYNC_SECRET: "expected-sync-secret",
    DISCOVERY_CURSOR_SECRET: "dedicated-discovery-cursor-secret",
  }),
}));

vi.mock("@/lib/supabase/anonymous", () => ({
  createAnonymousServerClient: mocks.createAnonymousServerClient,
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/features/sports/sync", () => ({
  createFootballDataSyncProvider: mocks.createProvider,
  runSportsSync: mocks.runSportsSync,
}));

vi.mock("@/lib/observability/server", () => ({
  elapsedMilliseconds: () => 42,
  safeLog: mocks.safeLog,
}));

function syncRequest(
  options: Readonly<{
    body?: unknown;
    cookie?: string;
    requestId?: string;
    secret?: string;
  }> = {},
) {
  const headers = new Headers();
  if (options.secret !== undefined) {
    headers.set("x-huddle-sync-secret", options.secret);
  }
  if (options.cookie !== undefined) {
    headers.set("cookie", options.cookie);
  }
  if (options.requestId !== undefined) {
    headers.set("x-request-id", options.requestId);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new NextRequest("https://huddle.test/api/internal/sports-sync", {
    method: "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

describe("POST /api/internal/sports-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.anonymousRpc.mockResolvedValue({ data: undefined, error: null });
    mocks.createAnonymousServerClient.mockReturnValue({ rpc: mocks.anonymousRpc });
    mocks.createServiceRoleClient.mockReturnValue({ kind: "service-client" });
    mocks.createProvider.mockReturnValue({
      kind: "provider",
      getRequestMetadata: () => ({ quotaRemaining: 8, requestCount: 3, retryCount: 0 }),
    });
    mocks.runSportsSync.mockResolvedValue({
      runId: "50000000-0000-4000-8000-000000000001",
      summary: {
        competitionsChanged: 2,
        teamsChanged: 4,
        matchesChanged: 2,
        durationMs: 42,
        quotaRemaining: 8,
        requestCount: 3,
        retryCount: 0,
      },
    });
  });

  it("returns one generic audited 401 before creating privileged clients for an invalid secret", async () => {
    const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const response = await POST(
      syncRequest({ secret: "wrong-secret", requestId, body: { reason: "manual" } }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
      requestId,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(mocks.anonymousRpc).toHaveBeenCalledWith("record_sports_sync_denial", {
      audit_request_id: requestId,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("does not treat an ordinary browser session as internal synchronization authority", async () => {
    const response = await POST(
      syncRequest({ cookie: "sb-session=ordinary-user-session", body: { reason: "manual" } }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("creates the service client and provider only after exact secret authentication", async () => {
    const response = await POST(
      syncRequest({ secret: "expected-sync-secret", body: { reason: "manual" } }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: "50000000-0000-4000-8000-000000000001",
      summary: { matchesChanged: 2, requestCount: 3 },
    });
    expect(mocks.createAnonymousServerClient).not.toHaveBeenCalled();
    expect(mocks.createServiceRoleClient).toHaveBeenCalledOnce();
    expect(mocks.createProvider).toHaveBeenCalledWith("provider-token");
    expect(mocks.runSportsSync).toHaveBeenCalledWith({
      database: { kind: "service-client" },
      provider: expect.objectContaining({ kind: "provider" }),
      reason: "manual",
    });
    expect(mocks.safeLog).toHaveBeenCalledWith(
      "info",
      "route.completed",
      expect.objectContaining({
        syncRequestCount: 3,
        retryCount: 0,
        quotaRemaining: 8,
      }),
    );
  });

  it("defaults an empty authenticated request to the scheduled reason", async () => {
    const response = await POST(syncRequest({ secret: "expected-sync-secret" }));

    expect(response.status).toBe(200);
    expect(mocks.runSportsSync).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "scheduled" }),
    );
  });

  it("rejects body attempts to expand competition scope before creating the service client", async () => {
    const response = await POST(
      syncRequest({
        secret: "expected-sync-secret",
        body: { reason: "manual", competitions: ["BL1"] },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.runSportsSync).not.toHaveBeenCalled();
  });

  it("maps malformed authenticated JSON to a safe 400 before privileged client creation", async () => {
    const response = await POST(
      new NextRequest("https://huddle.test/api/internal/sports-sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-huddle-sync-secret": "expected-sync-secret",
        },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns the stable 409 conflict for an overlapping database run", async () => {
    mocks.runSportsSync.mockRejectedValue(new DomainError("SYNC_ALREADY_RUNNING"));

    const response = await POST(syncRequest({ secret: "expected-sync-secret" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SYNC_ALREADY_RUNNING" },
    });
  });

  it("returns a safe 503 without provider payload details after a failed run", async () => {
    mocks.runSportsSync.mockRejectedValue(
      new DomainError("UPSTREAM_UNAVAILABLE", {
        cause: new Error("provider-token and raw provider payload"),
      }),
    );

    const response = await POST(syncRequest({ secret: "expected-sync-secret" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ error: { code: "UPSTREAM_UNAVAILABLE" } });
    expect(JSON.stringify(body)).not.toContain("provider-token");
    expect(JSON.stringify(body)).not.toContain("raw provider payload");
  });
});
