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
  city: "Haifa",
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
    mocks.requireActor.mockResolvedValue({ user: { id: "actor-id" } });
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
    const response = await POST(
      request({ query: "10 Herzl Street", city: "Haifa", locationKind: "venue" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ suggestions: [suggestion] });
    expect(mocks.requireActor).toHaveBeenCalledWith("common");
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_public_address_search", {
      input_city: "Haifa",
      input_country_code: "il",
      input_location_kind: "venue",
      input_query: "10 Herzl Street",
    });
    expect(mocks.search).toHaveBeenCalledWith("10 Herzl Street", "Haifa");
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

    const response = await POST(
      request({ query: "10 Herzl Street", city: "Haifa", locationKind: "public_place" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [suggestion] });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated requests before creating a service-role client", async () => {
    mocks.requireActor.mockRejectedValue(new DomainError("AUTH_REQUIRED"));

    const response = await POST(
      request({ query: "10 Herzl Street", city: "Haifa", locationKind: "venue" }),
    );

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

      const response = await POST(
        request({ query: "10 Herzl Street", city: "Haifa", locationKind: "venue" }),
      );

      expect(response.status).toBe(status);
      expect(mocks.requireActor).toHaveBeenCalledWith("common");
      expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(mocks.search).not.toHaveBeenCalled();
    },
  );

  it("rejects home/private input before authentication, cache, provider, or logging values", async () => {
    const privateValue = "PRIVATE-HOME-ADDRESS-MUST-NOT-LEAK";
    const response = await POST(
      request({ query: privateValue, city: "Haifa", locationKind: "home" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain(privateValue);
    expect(mocks.requireActor).not.toHaveBeenCalled();
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.safeLog.mock.calls)).not.toContain(privateValue);
  });

  it("validates query and city bounds without returning submitted text", async () => {
    const submitted = `SENSITIVE-SUBMITTED-${"Q".repeat(170)}`;
    const response = await POST(
      request({ query: submitted, city: "Haifa", locationKind: "public_place" }),
    );
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

    const response = await POST(
      request({ query: "10 Herzl Street", city: "Haifa", locationKind: "venue" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("maps provider failures to safe generic responses and never logs submitted text", async () => {
    const submitted = "SAFE-PUBLIC-QUERY-BUT-NOT-A-LOG-VALUE";
    mocks.search.mockRejectedValue(new DomainError("UPSTREAM_UNAVAILABLE"));

    const response = await POST(
      request({ query: submitted, city: "Haifa", locationKind: "venue" }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain(submitted);
    expect(JSON.stringify(mocks.safeLog.mock.calls)).not.toContain(submitted);
  });
});
