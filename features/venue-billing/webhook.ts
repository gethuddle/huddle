import "server-only";
import { webhooks } from "@polar-sh/sdk/2026-04";
import { z } from "zod";
import type { ServerEnvironment } from "@/lib/env/schema";
import { getServerEnvironment } from "@/lib/env/server";
import {
  applyPolarBillingEvent,
  completePolarBillingReconciliation,
  completePolarErasureCleanup,
} from "./database";
import { erasePolarExternalCustomer, getVenueSubscription } from "./polar";

export class PolarWebhookInputError extends Error {
  constructor(readonly code: "signature" | "payload" | "unsupported") {
    super(code);
  }
}
const date = z.iso.datetime({ offset: true }).transform((d) => new Date(d).toISOString());
const metadata = z.object({
  huddle_venue_id: z.uuid(),
  huddle_checkout_attempt_id: z.uuid(),
  huddle_schema_version: z.literal("1"),
});
const customer = z.object({ id: z.uuid(), external_id: z.uuid().nullable() });
const product = z.object({ id: z.uuid(), organization_id: z.uuid() });
const subscriptionTypes = z.enum([
  "subscription.created",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.cycled",
  "subscription.past_due",
  "subscription.revoked",
]);
const subscription = z.object({
  id: z.uuid(),
  modified_at: date.nullable(),
  customer_id: z.uuid(),
  product_id: z.uuid(),
  checkout_id: z.uuid().nullable(),
  metadata,
  customer,
  product: product.extend({
    recurring_interval: z.enum(["month", "year"]),
    recurring_interval_count: z.literal(1),
  }),
  amount: z.number().int().positive(),
  currency: z.string().transform((s) => s.toLowerCase()),
  recurring_interval: z.enum(["month", "year"]),
  recurring_interval_count: z.literal(1),
  status: z.enum([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]),
  cancel_at_period_end: z.boolean(),
  current_period_end: date.nullable(),
  past_due_at: date.nullish(),
  prices: z
    .array(
      z.object({
        id: z.uuid(),
        product_id: z.uuid(),
        amount_type: z.literal("fixed"),
        price_amount: z.number().int().positive(),
        price_currency: z.string().transform((s) => s.toLowerCase()),
        recurring_interval: z.enum(["month", "year"]).optional(),
      }),
    )
    .length(1),
});
type Subscription = z.infer<typeof subscription>;
type SubscriptionType = z.infer<typeof subscriptionTypes>;
type Binding = Readonly<{
  organizationId: string;
  subscriptionId: string;
  checkoutId: string | null;
  checkoutAttemptId: string;
  venueId: string;
  customerId: string;
  externalCustomerId: string;
  productId: string;
}>;
type PlanSnapshot = Readonly<{
  priceId: string;
  amountMinor: number;
  currency: string;
  interval: "month" | "year";
  intervalCount: 1;
  providerStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}>;
type Envelope = Readonly<{ webhookId: string; eventTimestamp: string; providerModifiedAt: string }>;
export type NormalizedPolarSubscriptionEvent = Envelope &
  Binding &
  PlanSnapshot &
  Readonly<{
    kind: "subscription";
    type: SubscriptionType;
    checkoutId: string;
    pastDueAt: string | null;
  }>;
export type NormalizedPolarErasedSubscriptionTerminalEvent = Omit<
  NormalizedPolarSubscriptionEvent,
  "kind" | "type" | "externalCustomerId"
> &
  Readonly<{
    kind: "erased_subscription_terminal";
    type: "subscription.revoked";
    externalCustomerId: null;
  }>;
export type NormalizedPolarRenewalReconciliationEvent = Envelope &
  Binding &
  Readonly<{
    kind: "renewal_reconciliation";
    type: "order.paid";
    orderId: string;
    billingReason: "subscription_cycle";
    signedCurrentPeriodEnd: string | null;
    subscriptionModifiedAt: string | null;
    interval: "month" | "year";
  }>;
export type NormalizedPolarRenewalPaidEvent = Omit<
  NormalizedPolarRenewalReconciliationEvent,
  "kind"
> &
  PlanSnapshot &
  Readonly<{ kind: "renewal_paid"; currentPeriodEnd: string }>;
export type NormalizedPolarBillingEvent =
  | NormalizedPolarSubscriptionEvent
  | NormalizedPolarErasedSubscriptionTerminalEvent
  | NormalizedPolarRenewalReconciliationEvent
  | NormalizedPolarRenewalPaidEvent;

function assertProduct(id: string, organizationId: string, env: ServerEnvironment) {
  if (
    organizationId !== env.POLAR_ORGANIZATION_ID ||
    ![env.POLAR_VENUE_MONTHLY_PRODUCT_ID, env.POLAR_VENUE_YEARLY_PRODUCT_ID].includes(id)
  )
    throw new PolarWebhookInputError("payload");
}
function normalizeSubscription(s: Subscription, eventTimestamp: string, env: ServerEnvironment) {
  assertProduct(s.product_id, s.product.organization_id, env);
  const interval = s.product_id === env.POLAR_VENUE_MONTHLY_PRODUCT_ID ? "month" : "year";
  const price = s.prices[0];
  if (
    s.product.id !== s.product_id ||
    s.customer.id !== s.customer_id ||
    s.recurring_interval !== interval ||
    s.product.recurring_interval !== interval ||
    s.amount !== (interval === "month" ? 1500 : 15000) ||
    s.currency !== "ils" ||
    price.product_id !== s.product_id ||
    price.price_amount !== s.amount ||
    price.price_currency !== s.currency ||
    (price.recurring_interval !== undefined && price.recurring_interval !== interval)
  )
    throw new PolarWebhookInputError("payload");
  return {
    organizationId: s.product.organization_id,
    subscriptionId: s.id,
    checkoutId: s.checkout_id,
    checkoutAttemptId: s.metadata.huddle_checkout_attempt_id,
    venueId: s.metadata.huddle_venue_id,
    customerId: s.customer_id,
    externalCustomerId: s.customer.external_id,
    productId: s.product_id,
    priceId: price.id,
    amountMinor: s.amount,
    currency: s.currency,
    interval: interval as "month" | "year",
    intervalCount: 1 as const,
    providerStatus: s.status,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    currentPeriodEnd: s.current_period_end,
    pastDueAt: s.status === "past_due" ? (s.past_due_at ?? eventTimestamp) : null,
    providerModifiedAt: s.modified_at ?? eventTimestamp,
  };
}

export async function validateAndNormalizePolarWebhook(
  rawBody: string,
  headers: Headers,
  environment: ServerEnvironment = getServerEnvironment(),
): Promise<NormalizedPolarBillingEvent> {
  const id = headers.get("webhook-id") ?? "";
  const timestamp = headers.get("webhook-timestamp") ?? "";
  const signature = headers.get("webhook-signature") ?? "";
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
    !/^\d{1,12}$/.test(timestamp) ||
    signature.length > 4096 ||
    !/^v\d+,[A-Za-z0-9+/]+={0,2}(?: v\d+,[A-Za-z0-9+/]+={0,2})*$/.test(signature)
  )
    throw new PolarWebhookInputError("signature");
  let validated: unknown;
  try {
    validated = await webhooks.validateEvent(
      rawBody,
      { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature },
      environment.POLAR_WEBHOOK_SECRET,
    );
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError)
      throw new PolarWebhookInputError("signature");
    if (error instanceof webhooks.PolarWebhookUnknownTypeError)
      throw new PolarWebhookInputError("unsupported");
    if (error instanceof webhooks.PolarWebhookError) throw new PolarWebhookInputError("payload");
    throw error;
  }
  try {
    const event = z
      .object({ type: z.string(), timestamp: date, data: z.unknown() })
      .parse(validated);
    if (event.type === "order.paid") {
      const reason = z.object({ billing_reason: z.string() }).parse(event.data);
      if (reason.billing_reason !== "subscription_cycle")
        throw new PolarWebhookInputError("unsupported");
      const order = z
        .object({
          id: z.uuid(),
          modified_at: date.nullable(),
          paid: z.literal(true),
          customer_id: z.uuid(),
          product_id: z.uuid(),
          subscription_id: z.uuid(),
          checkout_id: z.uuid().nullable(),
          metadata,
          customer: customer.extend({ external_id: z.uuid() }),
          product,
          subscription: z.unknown(),
        })
        .parse(event.data);
      assertProduct(order.product_id, order.product.organization_id, environment);
      if (order.product.id !== order.product_id || order.customer.id !== order.customer_id)
        throw new PolarWebhookInputError("payload");
      const core = {
        webhookId: id,
        eventTimestamp: event.timestamp,
        providerModifiedAt: order.modified_at ?? event.timestamp,
        type: "order.paid" as const,
        orderId: order.id,
        billingReason: "subscription_cycle" as const,
        organizationId: order.product.organization_id,
        subscriptionId: order.subscription_id,
        checkoutId: order.checkout_id,
        checkoutAttemptId: order.metadata.huddle_checkout_attempt_id,
        venueId: order.metadata.huddle_venue_id,
        customerId: order.customer_id,
        externalCustomerId: order.customer.external_id,
        productId: order.product_id,
        signedCurrentPeriodEnd: null as string | null,
        subscriptionModifiedAt: null as string | null,
        interval: (order.product_id === environment.POLAR_VENUE_MONTHLY_PRODUCT_ID
          ? "month"
          : "year") as "month" | "year",
      };
      // The SDK's real OrderSubscription omits customer/product/prices. Preserve
      // only complete signed order binding; the second transaction rechecks it.
      if (order.subscription != null) {
        const nested = z
          .object({
            id: z.uuid(),
            customer_id: z.uuid(),
            product_id: z.uuid(),
            checkout_id: z.uuid().nullable(),
            metadata,
            current_period_end: date.nullish(),
          })
          .parse(order.subscription);
        if (
          nested.id !== core.subscriptionId ||
          nested.customer_id !== core.customerId ||
          nested.product_id !== core.productId ||
          nested.metadata.huddle_venue_id !== core.venueId ||
          nested.metadata.huddle_checkout_attempt_id !== core.checkoutAttemptId ||
          (core.checkoutId !== null &&
            nested.checkout_id !== null &&
            core.checkoutId !== nested.checkout_id)
        )
          throw new PolarWebhookInputError("payload");
        core.checkoutId ??= nested.checkout_id;
        core.signedCurrentPeriodEnd = nested.current_period_end ?? null;
      }
      const parsed = subscription.safeParse(order.subscription);
      if (!parsed.success) return { ...core, kind: "renewal_reconciliation" };
      const snapshot = normalizeSubscription(parsed.data, event.timestamp, environment);
      if (
        snapshot.externalCustomerId !== core.externalCustomerId ||
        snapshot.currentPeriodEnd === null ||
        snapshot.providerStatus !== "active"
      )
        throw new PolarWebhookInputError("payload");
      if (parsed.data.modified_at === null) return { ...core, kind: "renewal_reconciliation" };
      return {
        ...snapshot,
        ...core,
        subscriptionModifiedAt: parsed.data.modified_at,
        kind: "renewal_paid",
        currentPeriodEnd: snapshot.currentPeriodEnd,
      };
    }
    const type = subscriptionTypes.safeParse(event.type);
    if (!type.success) throw new PolarWebhookInputError("unsupported");
    const snapshot = normalizeSubscription(
      subscription.parse(event.data),
      event.timestamp,
      environment,
    );
    if (snapshot.checkoutId === null) throw new PolarWebhookInputError("payload");
    const common = {
      ...snapshot,
      checkoutId: snapshot.checkoutId,
      webhookId: id,
      eventTimestamp: event.timestamp,
    };
    if (snapshot.externalCustomerId === null) {
      if (type.data !== "subscription.revoked" || snapshot.providerStatus !== "canceled")
        throw new PolarWebhookInputError("payload");
      return {
        ...common,
        kind: "erased_subscription_terminal",
        type: "subscription.revoked",
        externalCustomerId: null,
      };
    }
    return {
      ...common,
      kind: "subscription",
      type: type.data,
      externalCustomerId: snapshot.externalCustomerId,
    };
  } catch (error) {
    if (error instanceof PolarWebhookInputError) throw error;
    throw new PolarWebhookInputError("payload");
  }
}

// Provider I/O runs only after the apply RPC has committed and released locks.
export async function processPolarBillingEvent(
  event: NormalizedPolarBillingEvent,
  environment: ServerEnvironment = getServerEnvironment(),
): Promise<void> {
  const result = await applyPolarBillingEvent(event);
  if (result.outcome === "erasure_cleanup_required") {
    await erasePolarExternalCustomer(result.cleanupActorId, environment);
    await completePolarErasureCleanup(result.cleanupActorId, result.cleanupToken);
    return;
  }
  if (result.outcome !== "reconciliation_required") return;
  if (
    event.kind === "erased_subscription_terminal" ||
    (event.type === "order.paid" && event.signedCurrentPeriodEnd === null)
  )
    throw new Error("Reconciliation unavailable");
  const raw = await getVenueSubscription(event.subscriptionId, environment);
  const parsedCanonical = subscription.parse(raw);
  // An order's timestamp does not version its nested or fetched subscription.
  if (event.type === "order.paid" && parsedCanonical.modified_at === null)
    throw new Error("Reconciliation version unavailable");
  const canonical = normalizeSubscription(parsedCanonical, event.eventTimestamp, environment);
  if (
    canonical.organizationId !== event.organizationId ||
    canonical.subscriptionId !== event.subscriptionId ||
    canonical.customerId !== event.customerId ||
    canonical.externalCustomerId !== event.externalCustomerId ||
    canonical.productId !== event.productId ||
    canonical.venueId !== event.venueId ||
    canonical.checkoutAttemptId !== event.checkoutAttemptId ||
    (canonical.checkoutId !== null &&
      event.checkoutId !== null &&
      canonical.checkoutId !== event.checkoutId) ||
    (event.type === "order.paid" && canonical.currentPeriodEnd !== event.signedCurrentPeriodEnd)
  )
    throw new Error("Reconciliation binding failed");
  const outcome = await completePolarBillingReconciliation(event.webhookId, {
    ...canonical,
    externalCustomerId: event.externalCustomerId,
  });
  if (outcome === "reconciliation_required" || outcome === "erasure_cleanup_required")
    throw new Error("Reconciliation pending");
}
