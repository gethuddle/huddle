import type { z } from "zod";
import type { billingContextSchema } from "@/features/venue-billing/schemas";

export const activeVenueBilling: z.infer<typeof billingContextSchema> = {
  state: "active",
  interval: "month",
  checkoutPending: false,
  paidThroughAt: "2026-10-01T21:00:00Z",
  graceExpiresAt: null,
  publishCutoffAt: null,
  isPublic: true,
  canPublish: true,
  canPrepareDrafts: true,
  canOperateExistingEvents: true,
  canManageBilling: true,
  canStartCheckout: false,
  canOpenPortal: true,
};
export const expiredVenueBilling = {
  ...activeVenueBilling,
  state: "expired" as const,
  isPublic: false,
  canPublish: false,
  canPrepareDrafts: false,
  canOperateExistingEvents: false,
};
