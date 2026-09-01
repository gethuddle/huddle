import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  createServiceRoleClient: vi.fn(),
  search: vi.fn(),
  safeLog: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/features/locations/photon", () => ({
  createPhotonPublicGeocoder: () => ({ search: mocks.search }),
}));
vi.mock("@/lib/observability/server", () => ({
  elapsedMilliseconds: () => 4,
  safeLog: mocks.safeLog,
}));

const suggestion = {
  id: "101",
  label: "10 Herzl Street, Haifa, Israel",
  latitude: 32.815,
  longitude: 34.989,
};

function request(body: unknown) {
  return new NextRequest("https://huddle.test/api/locations/search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/locations/search", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ user: { id: "actor-id" }, supabase: { rpc } });
    mocks.createServiceRoleClient.mockReturnValue({ rpc });
    mocks.search.mockResolvedValue([suggestion]);
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            query_digest: "a".repeat(64),
            result_payload: null,
            cache_hit: false,
            claim_granted: true,
            retry_after_ms: 0,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
  });

  it("authenticates, claims one global slot, calls the provider, and stores a bounded result", async () => {
    const response = await POST(request({ query: "10 Herzl Street", purpose: "public_address" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ suggestions: [suggestion] });
    expect(mocks.requireActor).toHaveBeenCalledWith("common");
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_public_address_search", {
      input_country_code: "il",
      input_location_kind: "public_address",
      input_query: "10 Herzl Street",
    });
    expect(mocks.search).toHaveBeenCalledWith("10 Herzl Street");
    expect(rpc).toHaveBeenNthCalledWith(2, "store_public_address_search", {
      input_query_digest: "a".repeat(64),
      input_results: [suggestion],
      input_ttl_seconds: 86_400,
    });
  });

  it("returns a fresh validated cache hit without calling the provider", async () => {
    rpc.mockReset().mockResolvedValueOnce({
      data: [
        {
          query_digest: "b".repeat(64),
          result_payload: [suggestion],
          cache_hit: true,
          claim_granted: false,
          retry_after_ms: 0,
        },
      ],
      error: null,
    });

    const response = await POST(request({ query: "10 Herzl Street", purpose: "public_address" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [suggestion] });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated requests before creating a service-role client", async () => {
    mocks.requireActor.mockRejectedValue(new DomainError("AUTH_REQUIRED"));

    const response = await POST(request({ query: "10 Herzl Street", purpose: "public_address" }));

    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each([
    ["EMAIL_NOT_VERIFIED", 403],
    ["PROFILE_INCOMPLETE", 403],
    ["ADULT_ATTESTATION_REQUIRED", 403],
    ["RULES_ACCEPTANCE_REQUIRED", 403],
    ["ACCOUNT_SUSPENDED", 403],
    ["ACCOUNT_RESTRICTED", 403],
  ] as const)(
    "denies common-safety failure %s before consuming service/provider quota",
    async (code, status) => {
      mocks.requireActor.mockRejectedValue(new DomainError(code));

      const response = await POST(request({ query: "10 Herzl Street", purpose: "public_address" }));

      expect(response.status).toBe(status);
      expect(mocks.requireActor).toHaveBeenCalledWith("common");
      expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(mocks.search).not.toHaveBeenCalled();
    },
  );

  it("allows protected-home suggestions without storing the query or result", async () => {
    rpc.mockReset().mockResolvedValueOnce({
      data: [{ claim_granted: true }],
      error: null,
    });
    const privateValue = "PRIVATE-HOME-ADDRESS-NOT-FOR-STORAGE";
    const response = await POST(request({ query: privateValue, purpose: "private_home" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [suggestion] });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("claim_ephemeral_location_search", {
      input_purpose: "private_home",
    });
    expect(mocks.search).toHaveBeenCalledWith(privateValue);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(privateValue);
    expect(JSON.stringify(mocks.safeLog.mock.calls)).not.toContain(privateValue);
  });

  it("validates query bounds without returning submitted text", async () => {
    const submitted = `SENSITIVE-SUBMITTED-${"Q".repeat(170)}`;
    const response = await POST(request({ query: submitted, purpose: "public_address" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain(submitted);
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("returns a retryable 429 when another global upstream request owns the slot", async () => {
    rpc.mockReset().mockResolvedValueOnce({
      data: [
        {
          query_digest: "c".repeat(64),
          result_payload: null,
          cache_hit: false,
          claim_granted: false,
          retry_after_ms: 750,
        },
      ],
      error: null,
    });

    const response = await POST(request({ query: "10 Herzl Street", purpose: "public_address" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("maps provider failures to safe generic responses and never logs submitted text", async () => {
    const submitted = "SAFE-PUBLIC-QUERY-BUT-NOT-A-LOG-VALUE";
    mocks.search.mockRejectedValue(new DomainError("UPSTREAM_UNAVAILABLE"));

    const response = await POST(request({ query: submitted, purpose: "public_address" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain(submitted);
    expect(JSON.stringify(mocks.safeLog.mock.calls)).not.toContain(submitted);
  });
});
