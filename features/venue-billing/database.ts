import "server-only";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkoutContextSchema } from "./schemas";
import { z } from "zod";
import type { NormalizedPolarBillingEvent, NormalizedPolarSubscriptionEvent } from "./webhook";

export async function getCheckoutContext(
  actorId: string,
  venueId: string,
  selector: { attemptId: string; checkoutId?: never } | { checkoutId: string; attemptId?: never },
) {
  const { data, error } = await createServiceRoleClient().rpc("get_venue_checkout_context", {
    input_actor_id: actorId,
    input_venue_id: venueId,
    input_attempt_id: selector.attemptId ?? (null as unknown as string),
    input_checkout_id: selector.checkoutId ?? (null as unknown as string),
  });
  if (error) throw domainErrorFromDatabase(error);
  const parsed = checkoutContextSchema.safeParse(data);
  if (!parsed.success) throw new DomainError("INTERNAL_ERROR");
  return parsed.data;
}

const outcomeSchema = z.enum([
  "applied",
  "duplicate",
  "stale",
  "observed",
  "ignored",
  "reconciliation_required",
  "erasure_cleanup_required",
  "erasure_cleanup_complete",
]);
const applyResultSchema = z.union([
  z
    .object({
      outcome: z.literal("erasure_cleanup_required"),
      cleanup_actor_id: z.uuid(),
      cleanup_token: z.uuid(),
    })
    .strict(),
  z
    .object({
      outcome: outcomeSchema.exclude(["erasure_cleanup_required"]),
      cleanup_actor_id: z.null(),
      cleanup_token: z.null(),
    })
    .strict(),
]);
// Generated PostgREST argument types don't express SQL nullable scalar inputs.
const nullable = <T>(value: T | null): T => value as T;
export async function applyPolarBillingEvent(event: NormalizedPolarBillingEvent) {
  const snapshot = event.kind === "renewal_reconciliation" ? null : event;
  const { data, error } = await createServiceRoleClient().rpc("apply_polar_venue_billing_event", {
    input_webhook_id: event.webhookId,
    input_event_type: event.type,
    input_event_timestamp: event.eventTimestamp,
    input_provider_modified_at: event.providerModifiedAt,
    input_subscription_modified_at: nullable(
      event.type === "order.paid" ? event.subscriptionModifiedAt : null,
    ),
    input_organization_id: event.organizationId,
    input_subscription_id: event.subscriptionId,
    input_checkout_id: nullable(event.checkoutId),
    input_checkout_attempt_id: event.checkoutAttemptId,
    input_venue_id: event.venueId,
    input_customer_id: event.customerId,
    input_external_customer_id: nullable(event.externalCustomerId),
    input_product_id: event.productId,
    input_price_id: nullable(snapshot?.priceId ?? null),
    input_amount_minor: nullable(snapshot?.amountMinor ?? null),
    input_currency: nullable(snapshot?.currency ?? null),
    input_interval: event.interval,
    input_interval_count: nullable(snapshot?.intervalCount ?? null),
    input_provider_status: nullable(snapshot?.providerStatus ?? null),
    input_cancel_at_period_end: nullable(snapshot?.cancelAtPeriodEnd ?? null),
    input_current_period_end: nullable(snapshot?.currentPeriodEnd ?? null),
    input_past_due_at: nullable("pastDueAt" in event ? event.pastDueAt : null),
    input_order_id: nullable("orderId" in event ? event.orderId : null),
    input_billing_reason: nullable("billingReason" in event ? event.billingReason : null),
    input_audit_request_id: crypto.randomUUID(),
    input_signed_period_end: nullable(
      "signedCurrentPeriodEnd" in event ? event.signedCurrentPeriodEnd : null,
    ),
  });
  if (error) throw domainErrorFromDatabase(error);
  const parsed = z.array(applyResultSchema).length(1).safeParse(data);
  if (!parsed.success) throw new DomainError("INTERNAL_ERROR");
  const row = parsed.data[0];
  return row.outcome === "erasure_cleanup_required"
    ? ({
        outcome: row.outcome,
        cleanupActorId: row.cleanup_actor_id,
        cleanupToken: row.cleanup_token,
      } as const)
    : ({ outcome: row.outcome, cleanupActorId: null } as const);
}

type ReconciliationSnapshot = Pick<
  NormalizedPolarSubscriptionEvent,
  | "subscriptionId"
  | "providerModifiedAt"
  | "checkoutId"
  | "customerId"
  | "externalCustomerId"
  | "productId"
  | "priceId"
  | "amountMinor"
  | "currency"
  | "interval"
  | "intervalCount"
  | "providerStatus"
  | "cancelAtPeriodEnd"
  | "currentPeriodEnd"
>;
export async function completePolarBillingReconciliation(
  webhookId: string,
  snapshot: Omit<ReconciliationSnapshot, "checkoutId"> & { checkoutId: string | null },
) {
  const { data, error } = await createServiceRoleClient().rpc(
    "complete_polar_venue_billing_reconciliation",
    {
      input_webhook_id: webhookId,
      input_subscription_id: snapshot.subscriptionId,
      input_provider_modified_at: snapshot.providerModifiedAt,
      input_checkout_id: nullable(snapshot.checkoutId),
      input_customer_id: snapshot.customerId,
      input_external_customer_id: snapshot.externalCustomerId,
      input_product_id: snapshot.productId,
      input_price_id: snapshot.priceId,
      input_amount_minor: snapshot.amountMinor,
      input_currency: snapshot.currency,
      input_interval: snapshot.interval,
      input_interval_count: snapshot.intervalCount,
      input_provider_status: snapshot.providerStatus,
      input_cancel_at_period_end: snapshot.cancelAtPeriodEnd,
      input_current_period_end: nullable(snapshot.currentPeriodEnd),
      input_audit_request_id: crypto.randomUUID(),
    },
  );
  if (error) throw domainErrorFromDatabase(error);
  const parsed = outcomeSchema.safeParse(data);
  if (!parsed.success) throw new DomainError("INTERNAL_ERROR");
  return parsed.data;
}
export async function completePolarErasureCleanup(actorId: string, cleanupToken: string) {
  const { error } = await createServiceRoleClient().rpc("complete_polar_account_erasure_cleanup", {
    input_actor_id: actorId,
    input_request_id: crypto.randomUUID(),
    input_cleanup_token: cleanupToken,
  });
  // A newer receipt can invalidate an otherwise successful external deletion.
  // Keep the signed delivery retryable; this is not a malformed payload.
  if (error) throw new DomainError("UPSTREAM_UNAVAILABLE", { cause: error });
}
