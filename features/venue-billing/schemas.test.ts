import { expect, it } from "vitest";
import { startVenueCheckoutSchema, validateCheckout } from "./schemas";
import { getVenueBillingPlan } from "./plans";
import { billingEnvironment } from "@/tests/fixtures/polar-environment";

const id = "00000000-0000-4000-8000-000000000010";
const plan = getVenueBillingPlan("monthly", billingEnvironment());
const expected = {
  ownerId: id,
  venueId: id,
  attemptId: id,
  organizationId: billingEnvironment().POLAR_ORGANIZATION_ID,
  plan,
};
const checkout = {
  id,
  status: "open",
  created_at: new Date(),
  expires_at: new Date(Date.now() + 3600000),
  url: "https://sandbox.polar.sh/checkout/test",
  organization_id: expected.organizationId,
  external_customer_id: id,
  product_id: plan.polarProductId,
  product_price_id: id,
  amount: 1500,
  currency: "ils",
  metadata: { huddle_venue_id: id, huddle_checkout_attempt_id: id, huddle_schema_version: "1" },
  product: {
    id: plan.polarProductId,
    organization_id: expected.organizationId,
    recurring_interval: "month",
    recurring_interval_count: 1,
  },
  product_price: {
    id,
    product_id: plan.polarProductId,
    amount_type: "fixed",
    price_amount: 1500,
    price_currency: "ils",
  },
};
it("accepts only the two browser-selected fields", () => {
  expect(
    startVenueCheckoutSchema.parse({ venueId: id, plan: "monthly", amount: 1, customer: "evil" }),
  ).toEqual({ venueId: id, plan: "monthly" });
  expect(startVenueCheckoutSchema.safeParse({ venueId: id, plan: "free" }).success).toBe(false);
});
it("binds the current SDK price and product interval without trusting total amount", () => {
  expect(validateCheckout({ ...checkout, total_amount: 1770 }, expected).amount).toBe(1500);
});
it.each([
  { organization_id: id },
  { external_customer_id: "other" },
  { amount: 1 },
  { currency: "usd" },
  { product_id: id },
  { product_price_id: "other" },
  { metadata: {} },
  { product: { ...checkout.product, recurring_interval_count: 2 } },
  { product: { ...checkout.product, recurring_interval: "year" } },
  { product_price: { ...checkout.product_price, price_amount: 1 } },
  { url: "https://polar.sh/checkout/test" },
  { url: "https://sandbox.polar.sh.evil.test/checkout/test" },
  { url: "https://evil@sandbox.polar.sh/checkout/test" },
  { url: "https://sandbox.polar.sh/dashboard" },
])("rejects mismatched or unsafe provider response %j", (change) => {
  expect(() => validateCheckout({ ...checkout, ...change }, expected)).toThrow();
});
