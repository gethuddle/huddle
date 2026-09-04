import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { billingEnvironment } from "@/tests/fixtures/polar-environment";
import active from "@/tests/fixtures/polar/subscription-active.json";
import created from "@/tests/fixtures/polar/subscription-created.json";
import pastDue from "@/tests/fixtures/polar/subscription-past-due.json";
import erased from "@/tests/fixtures/polar/subscription-revoked-erased.json";
import renewal from "@/tests/fixtures/polar/order-paid-renewal.json";
import { validateAndNormalizePolarWebhook } from "./webhook";

const environment = billingEnvironment();
function signed(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const id = "local-webhook-1";
  const signature = createHmac("sha256", environment.POLAR_WEBHOOK_SECRET)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  });
}
function normalize(payload: unknown) {
  const body = JSON.stringify(payload);
  return validateAndNormalizePolarWebhook(body, signed(body), environment);
}
afterEach(() => vi.restoreAllMocks());

it("normalizes signed subscription binding and drops provider prose", async () => {
  const result = await normalize(active);
  expect(result).toMatchObject({
    kind: "subscription",
    webhookId: "local-webhook-1",
    priceId: "00000000-0000-4000-8000-000000000023",
    amountMinor: 1500,
    currency: "ils",
    providerModifiedAt: "2026-09-04T00:00:00.000Z",
    externalCustomerId: "00000000-0000-4000-8000-000000000010",
  });
  expect(result).not.toHaveProperty("customer");
});
it("uses signed timestamps for null modified time and absent failure time", async () => {
  expect(await normalize(created)).toMatchObject({
    providerModifiedAt: "2026-09-04T00:00:00.000Z",
    providerStatus: "incomplete",
  });
  expect(await normalize(pastDue)).toMatchObject({ pastDueAt: "2026-09-03T00:00:00.000Z" });
  expect(
    await normalize({ ...pastDue, data: { ...pastDue.data, past_due_at: null } }),
  ).toMatchObject({ pastDueAt: "2026-09-04T00:00:00.000Z" });
});
it("verifies original bytes before parsing malformed JSON", async () => {
  await expect(
    validateAndNormalizePolarWebhook("{bad", signed("different"), environment),
  ).rejects.toMatchObject({ code: "signature" });
  await expect(
    validateAndNormalizePolarWebhook("{bad", signed("{bad"), environment),
  ).rejects.toMatchObject({ code: "payload" });
});
it.each(["webhook-id", "webhook-timestamp", "webhook-signature"])(
  "rejects missing, duplicate or oversized %s",
  async (name) => {
    const body = JSON.stringify(active);
    for (const mode of ["missing", "duplicate", "oversized"]) {
      const headers = signed(body);
      if (mode === "missing") headers.delete(name);
      if (mode === "duplicate") headers.append(name, headers.get(name)!);
      if (mode === "oversized") headers.set(name, "x".repeat(4097));
      await expect(
        validateAndNormalizePolarWebhook(body, headers, environment),
      ).rejects.toMatchObject({ code: "signature" });
    }
  },
);
it("accepts signature rotation but rejects stale timestamps", async () => {
  const body = JSON.stringify(active);
  const headers = signed(body);
  headers.set(
    "webhook-signature",
    `v1,${Buffer.alloc(32).toString("base64")} ${headers.get("webhook-signature")}`,
  );
  expect(await validateAndNormalizePolarWebhook(body, headers, environment)).toMatchObject({
    kind: "subscription",
  });
  await expect(
    validateAndNormalizePolarWebhook(body, signed(body, "1"), environment),
  ).rejects.toMatchObject({ code: "signature" });
});
it("bounds unknown signed events without exposing their name", async () => {
  await expect(normalize({ type: "future.event-secret", data: {} })).rejects.toMatchObject({
    code: "unsupported",
  });
  await expect(normalize({ ...active, type: "subscription.updated" })).rejects.toMatchObject({
    code: "unsupported",
  });
});
it("rejects wrong organization, product, schema and contradictory price", async () => {
  const changes = [
    { product: { ...active.data.product, organization_id: active.data.customer_id } },
    { product_id: active.data.customer_id },
    { metadata: { ...active.data.metadata, huddle_schema_version: "2" } },
    { amount: 1499 },
  ];
  for (const change of changes)
    await expect(
      normalize({ ...active, data: { ...active.data, ...change } }),
    ).rejects.toMatchObject({ code: "payload" });
});
it("permits null external identity only for erased revoked terminal proof", async () => {
  expect(await normalize(erased)).toMatchObject({
    kind: "erased_subscription_terminal",
    externalCustomerId: null,
  });
  await expect(normalize({ ...erased, type: "subscription.active" })).rejects.toMatchObject({
    code: "payload",
  });
});
it("takes paid renewal amount from subscription price, preserving nullable checkout", async () => {
  expect(await normalize(renewal)).toMatchObject({
    kind: "renewal_paid",
    amountMinor: 1500,
    checkoutId: null,
    orderId: "00000000-0000-4000-8000-000000000024",
  });
});
it("keeps a nested subscription version separate from the later signed order clock", async () => {
  expect(
    await normalize({
      ...renewal,
      data: {
        ...renewal.data,
        modified_at: "2026-09-04T12:05:00Z",
        subscription: { ...renewal.data.subscription, modified_at: "2026-09-04T12:00:00Z" },
      },
    }),
  ).toMatchObject({
    kind: "renewal_paid",
    providerModifiedAt: "2026-09-04T12:05:00.000Z",
    subscriptionModifiedAt: "2026-09-04T12:00:00.000Z",
  });
});
it("reconciles a complete nested subscription with no object version instead of borrowing order time", async () => {
  expect(
    await normalize({
      ...renewal,
      data: {
        ...renewal.data,
        modified_at: "2026-09-04T12:05:00Z",
        subscription: { ...renewal.data.subscription, modified_at: null },
      },
    }),
  ).toMatchObject({
    kind: "renewal_reconciliation",
    providerModifiedAt: "2026-09-04T12:05:00.000Z",
    subscriptionModifiedAt: null,
  });
});
it("still rejects contradictory complete signed binding when its subscription version is null", async () => {
  await expect(
    normalize({
      ...renewal,
      data: {
        ...renewal.data,
        subscription: { ...renewal.data.subscription, modified_at: null, amount: 1499 },
      },
    }),
  ).rejects.toMatchObject({ code: "payload" });
});
it("retains real OrderSubscription proof for a separate canonical reconciliation", async () => {
  const subscription: Record<string, unknown> = { ...renewal.data.subscription };
  delete subscription.customer;
  delete subscription.product;
  delete subscription.prices;
  expect(await normalize({ ...renewal, data: { ...renewal.data, subscription } })).toMatchObject({
    kind: "renewal_reconciliation",
    subscriptionId: active.data.id,
    checkoutId: null,
  });
  expect(
    await normalize({ ...renewal, data: { ...renewal.data, subscription: null } }),
  ).toMatchObject({ kind: "renewal_reconciliation" });
  await expect(
    normalize({ ...renewal, data: { ...renewal.data, customer: null } }),
  ).rejects.toMatchObject({ code: "payload" });
});
it("rejects conflicting nested proof and unpaid orders; ignores initial orders", async () => {
  await expect(
    normalize({
      ...renewal,
      data: {
        ...renewal.data,
        subscription: { ...renewal.data.subscription, customer_id: active.data.id },
      },
    }),
  ).rejects.toMatchObject({ code: "payload" });
  await expect(
    normalize({ ...renewal, data: { ...renewal.data, paid: false } }),
  ).rejects.toMatchObject({ code: "payload" });
  await expect(
    normalize({ ...renewal, data: { ...renewal.data, billing_reason: "subscription_create" } }),
  ).rejects.toMatchObject({ code: "unsupported" });
});
it("normalization performs zero Polar network calls", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
  await normalize(active);
  await normalize(renewal);
  expect(
    fetchSpy.mock.calls.filter(([input]) => {
      const h = new URL(String(input)).hostname;
      return h === "polar.sh" || h.endsWith(".polar.sh");
    }),
  ).toHaveLength(0);
});
