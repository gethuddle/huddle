import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import active from "@/tests/fixtures/polar/subscription-active.json";
import renewal from "@/tests/fixtures/polar/order-paid-renewal.json";
import { billingEnvironment } from "@/tests/fixtures/polar-environment";
import { POST } from "./route";
const { rpc, getSubscription, eraseCustomer } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSubscription: vi.fn(),
  eraseCustomer: vi.fn(),
}));
vi.mock("@/lib/env/server", () => ({ getServerEnvironment: () => billingEnvironment() }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ rpc }) }));
vi.mock("@/features/venue-billing/polar", () => ({
  getVenueSubscription: getSubscription,
  erasePolarExternalCustomer: eraseCustomer,
}));
function request(payload: unknown = active, valid = true) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", billingEnvironment().POLAR_WEBHOOK_SECRET)
    .update(`route-test.${timestamp}.${valid ? body : "altered"}`)
    .digest("base64");
  return new Request("http://localhost/api/polar/webhooks", {
    method: "POST",
    body,
    headers: {
      "webhook-id": "route-test",
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({
    data: [{ outcome: "applied", cleanup_actor_id: null, cleanup_token: null }],
    error: null,
  });
});
afterEach(() => vi.restoreAllMocks());
it("rejects invalid signature before database or provider work", async () => {
  const response = await POST(request("{bad", false));
  expect(response.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect(getSubscription).not.toHaveBeenCalled();
  expect(eraseCustomer).not.toHaveBeenCalled();
});
it("returns bounded payload failure and acknowledges valid unsupported types", async () => {
  expect((await POST(request("{bad"))).status).toBe(400);
  expect((await POST(request({ type: "future.secret" }))).status).toBe(202);
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["applied", "duplicate", "stale", "observed", "ignored"])(
  "acknowledges %s without internal identifiers",
  async (outcome) => {
    rpc.mockResolvedValue({
      data: [{ outcome, cleanup_actor_id: null, cleanup_token: null }],
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  },
);
it("returns retryable failure without logging raw database errors", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  rpc.mockResolvedValue({ data: null, error: { message: "provider-secret" } });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(JSON.stringify(log.mock.calls)).not.toContain("provider-secret");
});
it("maps permanent scalar binding denial to an invalid payload response", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "INVALID_TRANSITION" } });
  expect((await POST(request())).status).toBe(400);
});
it("commits incomplete renewal proof then fetches and completes exactly that cycle", async () => {
  const subscription: Record<string, unknown> = { ...renewal.data.subscription };
  delete subscription.customer;
  delete subscription.product;
  delete subscription.prices;
  rpc
    .mockResolvedValueOnce({
      data: [{ outcome: "reconciliation_required", cleanup_actor_id: null, cleanup_token: null }],
      error: null,
    })
    .mockResolvedValueOnce({ data: "applied", error: null });
  getSubscription.mockResolvedValue(renewal.data.subscription);
  expect(
    (await POST(request({ ...renewal, data: { ...renewal.data, subscription } }))).status,
  ).toBe(200);
  expect(rpc.mock.calls.map((c) => c[0])).toEqual([
    "apply_polar_venue_billing_event",
    "complete_polar_venue_billing_reconciliation",
  ]);
  expect(getSubscription).toHaveBeenCalledWith(active.data.id, expect.anything());
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(getSubscription.mock.invocationCallOrder[0]);
  expect(getSubscription.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
});
it("never reconciles a paid order using a canonical subscription with no object version", async () => {
  rpc
    .mockResolvedValueOnce({
      data: [{ outcome: "reconciliation_required", cleanup_actor_id: null, cleanup_token: null }],
      error: null,
    })
    .mockResolvedValueOnce({ data: "applied", error: null });
  getSubscription.mockResolvedValue({ ...renewal.data.subscription, modified_at: null });
  expect((await POST(request(renewal))).status).toBe(503);
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(["apply_polar_venue_billing_event"]);
});
it("keeps unequal order and canonical subscription clocks across both transactions", async () => {
  const subscription: Record<string, unknown> = { ...renewal.data.subscription };
  delete subscription.prices;
  rpc
    .mockResolvedValueOnce({
      data: [{ outcome: "reconciliation_required", cleanup_actor_id: null, cleanup_token: null }],
      error: null,
    })
    .mockResolvedValueOnce({ data: "applied", error: null });
  getSubscription.mockResolvedValue({
    ...renewal.data.subscription,
    modified_at: "2026-09-04T12:00:00Z",
  });
  expect(
    (
      await POST(
        request({
          ...renewal,
          data: { ...renewal.data, modified_at: "2026-09-04T12:05:00Z", subscription },
        }),
      )
    ).status,
  ).toBe(200);
  expect(rpc.mock.calls[0][1]).toMatchObject({
    input_provider_modified_at: "2026-09-04T12:05:00.000Z",
    input_subscription_modified_at: null,
  });
  expect(rpc.mock.calls[1][1]).toMatchObject({
    input_provider_modified_at: "2026-09-04T12:00:00.000Z",
  });
});
it("passes the signed order and nested subscription versions as separate database inputs", async () => {
  expect(
    (
      await POST(
        request({
          ...renewal,
          data: {
            ...renewal.data,
            modified_at: "2026-09-04T12:05:00Z",
            subscription: { ...renewal.data.subscription, modified_at: "2026-09-04T12:00:00Z" },
          },
        }),
      )
    ).status,
  ).toBe(200);
  expect(rpc.mock.calls[0][1]).toMatchObject({
    input_provider_modified_at: "2026-09-04T12:05:00.000Z",
    input_subscription_modified_at: "2026-09-04T12:00:00.000Z",
  });
});
it("does not use absent signed period or a newer unpaid canonical cycle", async () => {
  rpc.mockResolvedValue({
    data: [{ outcome: "reconciliation_required", cleanup_actor_id: null, cleanup_token: null }],
    error: null,
  });
  expect(
    (await POST(request({ ...renewal, data: { ...renewal.data, subscription: null } }))).status,
  ).toBe(503);
  expect(getSubscription).not.toHaveBeenCalled();
  getSubscription.mockResolvedValue({
    ...renewal.data.subscription,
    current_period_end: "2026-11-04T00:00:00Z",
  });
  expect((await POST(request(renewal))).status).toBe(503);
  expect(rpc.mock.calls.every((c) => c[0] === "apply_polar_venue_billing_event")).toBe(true);
});
it("uses guarded erased actor for deletion then commits cleanup", async () => {
  const actor = "00000000-0000-4000-8000-000000000099";
  rpc
    .mockResolvedValueOnce({
      data: [
        {
          outcome: "erasure_cleanup_required",
          cleanup_actor_id: actor,
          cleanup_token: "ea000000-0000-4000-8000-000000000003",
        },
      ],
      error: null,
    })
    .mockResolvedValueOnce({ data: null, error: null });
  eraseCustomer.mockResolvedValue(undefined);
  expect((await POST(request())).status).toBe(200);
  expect(eraseCustomer).toHaveBeenCalledWith(actor, expect.anything());
  expect(rpc.mock.calls[1][0]).toBe("complete_polar_account_erasure_cleanup");
});
it("returns retryable failure when another receipt invalidates this webhook's cleanup fence", async () => {
  rpc
    .mockResolvedValueOnce({
      data: [
        {
          outcome: "erasure_cleanup_required",
          cleanup_actor_id: active.data.customer.external_id,
          cleanup_token: "ea000000-0000-4000-8000-000000000003",
        },
      ],
      error: null,
    })
    .mockResolvedValueOnce({ data: null, error: { message: "INVALID_TRANSITION" } });
  eraseCustomer.mockResolvedValue(undefined);
  expect((await POST(request())).status).toBe(503);
});
it("cleanup failures remain retryable and completed cleanup never repeats deletion", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        outcome: "erasure_cleanup_required",
        cleanup_actor_id: active.data.customer.external_id,
        cleanup_token: "ea000000-0000-4000-8000-000000000003",
      },
    ],
    error: null,
  });
  eraseCustomer.mockRejectedValue(new Error("sensitive failure"));
  expect((await POST(request())).status).toBe(503);
  expect(rpc).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: [{ outcome: "erasure_cleanup_complete", cleanup_actor_id: null, cleanup_token: null }],
    error: null,
  });
  expect((await POST(request())).status).toBe(200);
  expect(eraseCustomer).not.toHaveBeenCalled();
});
