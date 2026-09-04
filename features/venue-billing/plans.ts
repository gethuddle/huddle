import "server-only";

import type { ServerEnvironment } from "@/lib/env/schema";
import { getServerEnvironment } from "@/lib/env/server";

import {
  venueBillingPlanKeySchema,
  type VenueBillingPlan,
  type VenueBillingPlanKey,
} from "./types";

export function getVenueBillingPlan(
  key: VenueBillingPlanKey,
  environment: ServerEnvironment = getServerEnvironment(),
): VenueBillingPlan {
  const plan = venueBillingPlanKeySchema.parse(key);
  return Object.freeze({
    key: plan,
    name: plan === "monthly" ? "Monthly" : "Annual",
    amountMinor: plan === "monthly" ? 1500 : 15000,
    currency: "ILS",
    interval: plan === "monthly" ? "month" : "year",
    intervalCount: 1,
    polarProductId:
      plan === "monthly"
        ? environment.POLAR_VENUE_MONTHLY_PRODUCT_ID
        : environment.POLAR_VENUE_YEARLY_PRODUCT_ID,
  });
}
