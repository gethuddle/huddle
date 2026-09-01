import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  enabled: true,
  requireActor: vi.fn(),
  executeAssistedDiscovery: vi.fn(),
  safeLog: vi.fn(),
  interpreterConstructor: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    ASSISTED_DISCOVERY_ENABLED: mocks.enabled,
    ASSISTED_DISCOVERY_TOKEN_SECRET: "an-assisted-discovery-route-token-secret",
    CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
    CLOUDFLARE_WORKERS_AI_API_TOKEN: "cloudflare-secret-token",
  }),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/features/assisted-discovery/service", () => ({
  executeAssistedDiscovery: mocks.executeAssistedDiscovery,
}));
vi.mock("@/features/assisted-discovery/cloudflare-interpreter", () => ({
  ASSISTED_DISCOVERY_MODEL: "@cf/meta/llama-3.1-8b-instruct-fast",
  ASSISTED_DISCOVERY_PROMPT_VERSION: "ai01-v1",
  CloudflareWorkersAiInterpreter: class {
    constructor(options: unknown) {
      mocks.interpreterConstructor(options);
    }
    interpret = vi.fn();
  },
}));
vi.mock("@/lib/observability/server", () => ({
  elapsedMilliseconds: () => 12,
  safeLog: mocks.safeLog,
}));

function request(body: unknown) {
  return new NextRequest("https://huddle.test/api/assisted-discovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/assisted-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.requireActor.mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      supabase: { rpc: vi.fn(), from: vi.fn() },
    });
    mocks.executeAssistedDiscovery.mockResolvedValue({
      status: "no_results",
      interpretation: "2 Sep · Arsenal FC",
      exploreHref: "/discover?from=2026-09-02",
      planHref: null,
    });
  });

  it("requires an activated Fan and always returns private no-store JSON", async () => {
    const response = await POST(request({ kind: "interpret", query: "Arsenal tomorrow" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(mocks.executeAssistedDiscovery).toHaveBeenCalledWith(
      { kind: "interpret", query: "Arsenal tomorrow" },
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        tokenSecret: "an-assisted-discovery-route-token-secret",
        interpreter: expect.any(Object),
      }),
    );
    expect(mocks.interpreterConstructor).toHaveBeenCalledWith({
      accountId: "cloudflare-account",
      apiToken: "cloudflare-secret-token",
    });
  });

  it("keeps the disabled feature undiscoverable and does not authenticate or call AI", async () => {
    mocks.enabled = false;

    const response = await POST(request({ kind: "interpret", query: "Arsenal tomorrow" }));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.requireActor).not.toHaveBeenCalled();
    expect(mocks.interpreterConstructor).not.toHaveBeenCalled();
    expect(mocks.executeAssistedDiscovery).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized bodies before authentication", async () => {
    const malformed = await POST(request("{"));
    const oversized = await POST(request("x".repeat(4097)));

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("maps authentication, application rate, and provider failures safely", async () => {
    mocks.requireActor.mockRejectedValueOnce(new DomainError("AUTH_REQUIRED"));
    const unauthenticated = await POST(request({ kind: "interpret", query: "Arsenal tomorrow" }));

    mocks.requireActor.mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      supabase: { rpc: vi.fn(), from: vi.fn() },
    });
    mocks.executeAssistedDiscovery.mockRejectedValueOnce(new DomainError("RATE_LIMITED"));
    const limited = await POST(request({ kind: "interpret", query: "Arsenal tomorrow" }));
    mocks.executeAssistedDiscovery.mockRejectedValueOnce(new DomainError("UPSTREAM_UNAVAILABLE"));
    const unavailable = await POST(request({ kind: "interpret", query: "Arsenal tomorrow" }));

    expect(unauthenticated.status).toBe(401);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(unavailable.status).toBe(503);
  });

  it("logs only allowlisted aggregates, never query, actor, origin, or credentials", async () => {
    const rawQuery = "Arsenal tomorrow near my exact place";
    await POST(request({ kind: "interpret", query: rawQuery, origin: { lat: 32.8, lng: 35 } }));

    const logs = JSON.stringify(mocks.safeLog.mock.calls);
    expect(logs).not.toContain(rawQuery);
    expect(logs).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(logs).not.toContain("32.8");
    expect(logs).not.toContain("cloudflare-secret-token");
    expect(mocks.safeLog).toHaveBeenCalledWith(
      "info",
      "assisted_discovery.completed",
      expect.objectContaining({
        code: "no_results",
        modelVersion: "@cf/meta/llama-3.1-8b-instruct-fast",
        promptVersion: "ai01-v1",
        itemCount: 0,
      }),
    );
  });
});
