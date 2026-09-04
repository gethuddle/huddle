import { z } from "zod";
import type { VenueBillingPlan } from "./types";

export const startVenueCheckoutSchema = z.object({
  venueId: z.uuid(),
  plan: z.enum(["monthly", "yearly"]),
});
export const billingContextSchema = z
  .object({
    state: z.enum([
      "payment_required",
      "confirming",
      "active",
      "canceling",
      "past_due",
      "provider_stale",
      "legacy_grace",
      "expired",
    ]),
    interval: z.enum(["month", "year"]).nullable(),
    checkoutPending: z.boolean(),
    paidThroughAt: z.string().nullable(),
    graceExpiresAt: z.string().nullable(),
    publishCutoffAt: z.string().nullable(),
    isPublic: z.boolean(),
    canPublish: z.boolean(),
    canPrepareDrafts: z.boolean(),
    canOperateExistingEvents: z.boolean(),
    canManageBilling: z.boolean(),
    canStartCheckout: z.boolean(),
    canOpenPortal: z.boolean(),
  })
  .strict();
export const archivedVenueBillingContextSchema = billingContextSchema
  .pick({ state: true, interval: true, paidThroughAt: true, canOpenPortal: true })
  .extend({
    venueId: z.uuid(),
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

export const checkoutContextSchema = z
  .object({
    attemptId: z.uuid(),
    createdAt: z.string().refine((s) => Number.isFinite(Date.parse(s))),
    interval: z.enum(["month", "year"]),
    state: z.enum(["reserved", "uncertain", "attached", "completed", "failed", "expired"]),
    generation: z.number().int().positive(),
    checkoutId: z.string().nullable(),
    expiresAt: z.string().nullable(),
    organizationId: z.string().nullable(),
    productId: z.string().nullable(),
    priceId: z.string().nullable(),
    amount: z.number().nullable(),
    currency: z.literal("ils").nullable(),
    intervalCount: z.literal(1).nullable(),
    externalCustomerId: z.uuid().nullable(),
  })
  .strict();
export type CheckoutContext = z.infer<typeof checkoutContextSchema>;
const date = z
  .union([z.date(), z.string().refine((s) => Number.isFinite(Date.parse(s)))])
  .transform((d) => new Date(d).toISOString());
const checkoutSchema = z.object({
  id: z.uuid(),
  created_at: date,
  expires_at: date,
  status: z.enum(["open", "confirmed", "succeeded", "expired", "failed"]),
  url: z.url(),
  organization_id: z.uuid(),
  product_id: z.uuid(),
  product_price_id: z.uuid(),
  external_customer_id: z.uuid(),
  amount: z.number().int(),
  currency: z.string().transform((s) => s.toLowerCase()),
  metadata: z.object({
    huddle_venue_id: z.uuid(),
    huddle_checkout_attempt_id: z.uuid(),
    huddle_schema_version: z.literal("1"),
  }),
  product: z.object({
    id: z.uuid(),
    organization_id: z.uuid(),
    recurring_interval: z.enum(["month", "year"]),
    recurring_interval_count: z.literal(1),
  }),
  product_price: z.object({
    id: z.uuid(),
    product_id: z.uuid(),
    amount_type: z.literal("fixed"),
    price_amount: z.number().int(),
    price_currency: z.string().transform((s) => s.toLowerCase()),
    recurring_interval: z.enum(["month", "year"]).optional(),
  }),
});
export type ValidatedCheckout = z.infer<typeof checkoutSchema>;
export function validateCheckout(
  raw: unknown,
  expected: {
    ownerId: string;
    venueId: string;
    attemptId: string;
    organizationId: string;
    plan: VenueBillingPlan;
  },
  stored?: CheckoutContext,
): ValidatedCheckout {
  const c = checkoutSchema.parse(raw);
  const p = expected.plan;
  const url = new URL(c.url);
  if (
    url.origin !== "https://sandbox.polar.sh" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/checkout/") ||
    url.hash ||
    c.organization_id !== expected.organizationId ||
    c.external_customer_id !== expected.ownerId ||
    c.product_id !== p.polarProductId ||
    c.amount !== p.amountMinor ||
    c.currency !== "ils" ||
    c.product.id !== c.product_id ||
    c.product.organization_id !== c.organization_id ||
    c.product.recurring_interval !== p.interval ||
    c.product_price.id !== c.product_price_id ||
    c.product_price.product_id !== c.product_id ||
    c.product_price.price_amount !== c.amount ||
    c.product_price.price_currency !== c.currency ||
    (c.product_price.recurring_interval !== undefined &&
      c.product_price.recurring_interval !== p.interval) ||
    c.metadata.huddle_venue_id !== expected.venueId ||
    c.metadata.huddle_checkout_attempt_id !== expected.attemptId ||
    (stored?.checkoutId !== null &&
      stored?.checkoutId !== undefined &&
      (stored.checkoutId !== c.id ||
        stored.organizationId !== c.organization_id ||
        stored.productId !== c.product_id ||
        stored.priceId !== c.product_price_id ||
        stored.amount !== c.amount ||
        stored.currency !== c.currency ||
        stored.interval !== p.interval ||
        stored.intervalCount !== 1 ||
        stored.externalCustomerId !== c.external_customer_id ||
        Date.parse(stored.expiresAt ?? "") !== Date.parse(c.expires_at)))
  ) {
    throw new Error("Invalid checkout binding");
  }
  return c;
}
