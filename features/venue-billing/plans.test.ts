import { describe, expect, it } from "vitest";

import { billingEnvironment, polarEnvironment } from "@/tests/fixtures/polar-environment";

import { getVenueBillingPlan } from "./plans";
import { venueBillingPlanKeySchema } from "./types";

describe("venue billing plans", () => {
  it.each(["monthly", "yearly"])("accepts the allowlisted %s plan", (key) => {
    expect(venueBillingPlanKeySchema.parse(key)).toBe(key);
  });
  it.each(["annual", "free", "", null, { amount: 1 }])("rejects arbitrary plan input %s", (key) => {
    expect(venueBillingPlanKeySchema.safeParse(key).success).toBe(false);
  });
  it("owns prices independently of environment input", () => {
    const environment = billingEnvironment();
    expect(getVenueBillingPlan("monthly", environment)).toEqual({
      key: "monthly",
      name: "Monthly",
      amountMinor: 1500,
      currency: "ILS",
      interval: "month",
      intervalCount: 1,
      polarProductId: polarEnvironment.POLAR_VENUE_MONTHLY_PRODUCT_ID,
    });
    expect(getVenueBillingPlan("yearly", environment)).toEqual({
      key: "yearly",
      name: "Annual",
      amountMinor: 15000,
      currency: "ILS",
      interval: "year",
      intervalCount: 1,
      polarProductId: polarEnvironment.POLAR_VENUE_YEARLY_PRODUCT_ID,
    });
  });
});
