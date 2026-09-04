import { expect, it, vi } from "vitest";
import {
  getCheckoutContext,
  applyPolarBillingEvent,
  completePolarBillingReconciliation,
} from "./database";
import type { NormalizedPolarBillingEvent } from "./webhook";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ rpc }) }));
it("rejects a malformed service projection without returning raw data", async () => {
  rpc.mockResolvedValue({ data: { provider_secret: "private" }, error: null });
  await expect(
    getCheckoutContext("actor", "venue", { attemptId: "attempt" }),
  ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
});
it("propagates only bounded database denial", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "NOT_FOUND" } });
  await expect(
    getCheckoutContext("actor", "venue", { checkoutId: "checkout" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
const event: NormalizedPolarBillingEvent = {
  interval: "month",
  kind: "renewal_reconciliation",
  type: "order.paid",
  webhookId: "wh-local",
  orderId: "order-local",
  billingReason: "subscription_cycle",
  eventTimestamp: "2026-09-04T00:00:00.000Z",
  providerModifiedAt: "2026-09-04T00:00:00.000Z",
  organizationId: "org",
  subscriptionId: "sub",
  checkoutId: null,
  checkoutAttemptId: "00000000-0000-4000-8000-000000000012",
  venueId: "00000000-0000-4000-8000-000000000011",
  customerId: "customer",
  externalCustomerId: "00000000-0000-4000-8000-000000000010",
  productId: "product",
  signedCurrentPeriodEnd: "2026-10-04T00:00:00.000Z",
  subscriptionModifiedAt: null,
};
it("passes only scalar signed proof with SQL NULL for absent fields", async () => {
  rpc.mockResolvedValue({
    data: [{ outcome: "reconciliation_required", cleanup_actor_id: null, cleanup_token: null }],
    error: null,
  });
  expect(await applyPolarBillingEvent(event)).toEqual({
    outcome: "reconciliation_required",
    cleanupActorId: null,
  });
  expect(rpc).toHaveBeenLastCalledWith(
    "apply_polar_venue_billing_event",
    expect.objectContaining({
      input_checkout_id: null,
      input_price_id: null,
      input_provider_status: null,
      input_signed_period_end: "2026-10-04T00:00:00.000Z",
      input_order_id: "order-local",
      input_external_customer_id: "00000000-0000-4000-8000-000000000010",
    }),
  );
  expect(
    Object.values(rpc.mock.calls.at(-1)![1]).every(
      (v) => v === null || ["string", "number", "boolean"].includes(typeof v),
    ),
  ).toBe(true);
});
it("returns actor only for guarded erasure cleanup and rejects malformed outcomes", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        outcome: "erasure_cleanup_required",
        cleanup_actor_id: event.externalCustomerId,
        cleanup_token: "ea000000-0000-4000-8000-000000000003",
      },
    ],
    error: null,
  });
  expect(await applyPolarBillingEvent(event)).toEqual({
    outcome: "erasure_cleanup_required",
    cleanupActorId: event.externalCustomerId,
    cleanupToken: "ea000000-0000-4000-8000-000000000003",
  });
  rpc.mockResolvedValue({
    data: [
      {
        outcome: "applied",
        cleanup_actor_id: event.externalCustomerId,
        cleanup_token: "ea000000-0000-4000-8000-000000000003",
      },
    ],
    error: null,
  });
  await expect(applyPolarBillingEvent(event)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
});
it("reconciliation output cannot leak arbitrary provider diagnostics", async () => {
  rpc.mockResolvedValue({ data: "provider-secret", error: null });
  await expect(
    completePolarBillingReconciliation(event.webhookId, {
      ...event,
      priceId: "price",
      amountMinor: 1500,
      currency: "ils",
      interval: "month",
      intervalCount: 1,
      providerStatus: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: event.signedCurrentPeriodEnd,
    }),
  ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
});
