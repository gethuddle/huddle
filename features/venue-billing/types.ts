import { z } from "zod";
import type { billingContextSchema } from "./schemas";

export type VenueBillingContext = z.infer<typeof billingContextSchema>;
export type FixturePlannerBillingCapabilities = Readonly<{
  canPublish: boolean;
  canPrepareDrafts: boolean;
  publishCutoffAt: string | null;
  blockedReason: string | null;
}>;

export const venueBillingPlanKeySchema = z.enum(["monthly", "yearly"]);
export type VenueBillingPlanKey = z.infer<typeof venueBillingPlanKeySchema>;

export type VenueBillingPlan = Readonly<{
  key: VenueBillingPlanKey;
  name: string;
  amountMinor: 1500 | 15000;
  currency: "ILS";
  interval: "month" | "year";
  intervalCount: 1;
  polarProductId: string;
}>;
