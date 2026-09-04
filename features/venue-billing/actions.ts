"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/features/auth/actor";
import { getServerEnvironment } from "@/lib/env/server";
import {
  actionFailure,
  DomainError,
  domainErrorFromDatabase,
  type ActionResult,
} from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { CHECKOUT_RECONCILIATION_TIMEOUT_MS } from "./constants";
import { getCheckoutContext } from "./database";
import { getVenueBillingPlan } from "./plans";
import {
  createVenueCheckout,
  listVenueCheckouts,
  getVenueCheckout,
  isDefinitiveCheckoutRejection,
  createVenueCustomerSession,
} from "./polar";
import {
  billingContextSchema,
  archivedVenueBillingContextSchema,
  startVenueCheckoutSchema,
  validateCheckout,
  type ValidatedCheckout,
} from "./schemas";

export async function openArchivedVenueBillingPortalAction(
  rawInput: unknown,
): Promise<ActionResult<never>> {
  let destination: string;
  try {
    const { slug } = z
      .object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) })
      .parse(rawInput);
    const { user, supabase } = await requireActor("common");
    const { data, error } = await supabase.rpc("get_archived_venue_billing_context", {
      input_slug: slug,
    });
    if (error) throw domainErrorFromDatabase(error);
    const context = archivedVenueBillingContextSchema.parse(data);
    if (!context.canOpenPortal) throw new DomainError("NOT_FOUND");
    const response = await createVenueCustomerSession({
      ownerId: user.id,
      venueSlug: context.slug,
      returnTo: "archived",
    });
    const parsed = z.object({ customer_portal_url: z.url() }).parse(response);
    const url = new URL(parsed.customer_portal_url);
    if (url.origin !== "https://sandbox.polar.sh" || url.username || url.password || url.hash)
      throw new DomainError("UPSTREAM_UNAVAILABLE");
    destination = url.href;
  } catch (error) {
    return actionFailure(
      error instanceof DomainError ? error : new DomainError("UPSTREAM_UNAVAILABLE"),
    );
  }
  redirect(destination);
}

export async function openVenueBillingPortalAction(
  rawInput: unknown,
): Promise<ActionResult<never>> {
  let destination: string;
  try {
    const { venueId } = z.object({ venueId: z.uuid() }).parse(rawInput);
    const { user, supabase } = await requireActor("common");
    // This RPC rechecks exact ownership and a coherent current subscription binding.
    const { data, error } = await supabase.rpc("get_venue_billing_context", {
      input_venue_id: venueId,
    });
    if (error) throw domainErrorFromDatabase(error);
    const context = billingContextSchema.parse(data);
    if (!context.canManageBilling || !context.canOpenPortal) throw new DomainError("NOT_FOUND");
    const workspaces = await supabase.rpc("list_my_workspaces");
    if (workspaces.error) throw domainErrorFromDatabase(workspaces.error);
    const workspace = workspaces.data.find(
      (w) => w.workspace_kind === "venue" && w.workspace_id === venueId,
    );
    const venueSlug = z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .parse(workspace?.slug);
    const response = await createVenueCustomerSession({ ownerId: user.id, venueSlug });
    const parsed = z.object({ customer_portal_url: z.url() }).parse(response);
    const url = new URL(parsed.customer_portal_url);
    if (url.origin !== "https://sandbox.polar.sh" || url.username || url.password || url.hash)
      throw new DomainError("UPSTREAM_UNAVAILABLE");
    destination = url.href;
  } catch (error) {
    return actionFailure(
      error instanceof DomainError ? error : new DomainError("UPSTREAM_UNAVAILABLE"),
    );
  }
  redirect(destination);
}

const pending = () => new DomainError("VENUE_BILLING_PENDING");
export async function startVenueCheckoutAction(rawInput: unknown): Promise<ActionResult<never>> {
  let destination: string;
  try {
    const input = startVenueCheckoutSchema.parse(rawInput);
    const { supabase, user } = await requireActor("common");
    const ownerEmail = z.email().parse(user.email);
    if (!user.email_confirmed_at) throw new DomainError("EMAIL_NOT_VERIFIED");
    const requestId = await getRequestId();
    const service = createServiceRoleClient();
    let selectedInterval: "month" | "year" = input.plan === "monthly" ? "month" : "year";
    // At most one new generation after confirmed terminal evidence. No sleeps or
    // unbounded provider retries run inside this user request.
    for (let round = 0; round < 2; round++) {
      const reservation = await supabase.rpc("reserve_venue_billing_checkout", {
        input_venue_id: input.venueId,
        input_interval: selectedInterval,
        input_request_id: requestId,
      });
      if (reservation.error) throw domainErrorFromDatabase(reservation.error);
      const reserved = z
        .object({
          attempt_id: z.uuid(),
          generation: z.number().int().positive(),
          created_by_this_call: z.boolean(),
        })
        .parse(reservation.data?.[0]);
      const context = await getCheckoutContext(user.id, input.venueId, {
        attemptId: reserved.attempt_id,
      });
      if (context.generation !== reserved.generation) throw pending();
      selectedInterval = context.interval;
      const workspaces = await supabase.rpc("list_my_workspaces");
      if (workspaces.error) throw domainErrorFromDatabase(workspaces.error);
      const workspace = workspaces.data.find(
        (w) => w.workspace_kind === "venue" && w.workspace_id === input.venueId,
      );
      const slug = z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .parse(workspace?.slug);
      const planKey = context.interval === "month" ? "monthly" : "yearly";
      const plan = getVenueBillingPlan(planKey);
      const expected = {
        ownerId: user.id,
        venueId: input.venueId,
        attemptId: context.attemptId,
        organizationId: getServerEnvironment().POLAR_ORGANIZATION_ID,
        plan,
      };
      const validate = (raw: unknown) => {
        try {
          return validateCheckout(raw, expected, context);
        } catch {
          throw pending();
        }
      };
      let checkout: ValidatedCheckout;
      let attached = context.state === "attached";
      if (attached) {
        checkout = validate(await getVenueCheckout(z.uuid().parse(context.checkoutId)));
      } else if (reserved.created_by_this_call && context.state === "reserved") {
        try {
          checkout = validate(
            await createVenueCheckout({
              ownerId: user.id,
              ownerEmail,
              venueId: input.venueId,
              venueSlug: slug,
              attemptId: context.attemptId,
              planKey,
            }),
          );
        } catch (error) {
          if (isDefinitiveCheckoutRejection(error)) {
            const rejected = await service.rpc("fail_venue_billing_checkout", {
              input_attempt_id: context.attemptId,
              input_failure_code: "request_rejected",
              input_request_id: requestId,
            });
            if (rejected.error) throw domainErrorFromDatabase(rejected.error);
            throw new DomainError("UPSTREAM_UNAVAILABLE");
          }
          const marked = await service.rpc("mark_venue_checkout_uncertain", {
            input_attempt_id: context.attemptId,
          });
          if (marked.error) throw domainErrorFromDatabase(marked.error);
          throw pending();
        }
      } else {
        const lookup = async () => {
          const matches: ValidatedCheckout[] = [];
          let total: number | undefined;
          let previousCreatedAt = Infinity;
          const recentSince = Date.parse(context.createdAt) - 60_000;
          for (let page = 1; page <= 10; page++) {
            const response = z
              .object({
                items: z.array(z.unknown()).max(100),
                pagination: z.object({
                  total_count: z.number().int().nonnegative(),
                  max_page: z.number().int().nonnegative(),
                }),
              })
              .parse(await listVenueCheckouts({ ownerId: user.id, planKey, page }));
            if (total !== undefined && response.pagination.total_count !== total) throw pending();
            total = response.pagination.total_count;
            if (
              response.items.length !== Math.min(100, Math.max(0, total - (page - 1) * 100)) ||
              (response.pagination.max_page !== Math.ceil(total / 100) &&
                !(total === 0 && response.pagination.max_page === 1))
            )
              throw pending();
            let crossedRecentBoundary = false;
            for (const raw of response.items) {
              const identity = z
                .object({
                  created_at: z.union([z.date(), z.string()]),
                  metadata: z.record(z.string(), z.unknown()),
                })
                .safeParse(raw);
              if (!identity.success) throw pending();
              const createdAt = new Date(identity.data.created_at).getTime();
              if (!Number.isFinite(createdAt) || createdAt > previousCreatedAt) throw pending();
              previousCreatedAt = createdAt;
              if (createdAt < recentSince) crossedRecentBoundary = true;
              if (identity.data.metadata.huddle_checkout_attempt_id !== context.attemptId) continue;
              if (createdAt < recentSince) throw pending();
              matches.push(validate(raw));
            }
            if (matches.length > 1) throw pending();
            if (page >= response.pagination.max_page || crossedRecentBoundary) return matches;
          }
          throw pending(); // Truncated result is never proof of absence.
        };
        let matches = await lookup();
        if (
          !matches.length &&
          Date.now() - Date.parse(context.createdAt) >= CHECKOUT_RECONCILIATION_TIMEOUT_MS
        ) {
          matches = await lookup();
          if (!matches.length) {
            const failed = await service.rpc("fail_venue_billing_checkout", {
              input_attempt_id: context.attemptId,
              input_failure_code: "not_created_after_timeout",
              input_request_id: requestId,
            });
            if (failed.error) throw domainErrorFromDatabase(failed.error);
          }
        }
        if (matches.length !== 1) throw pending();
        checkout = matches[0];
      }
      if (!attached) {
        const binding = {
          input_attempt_id: context.attemptId,
          input_checkout_id: checkout.id,
          input_checkout_expires_at: checkout.expires_at,
          input_organization_id: checkout.organization_id,
          input_product_id: checkout.product_id,
          input_product_price_id: checkout.product_price_id,
          input_amount: checkout.amount,
          input_currency: checkout.currency,
          input_interval: plan.interval,
          input_interval_count: 1,
          input_external_customer_id: user.id,
        };
        const result =
          checkout.status === "open"
            ? await service.rpc("attach_venue_billing_checkout", {
                ...binding,
                input_request_id: requestId,
              })
            : await service.rpc("reconcile_venue_billing_checkout", {
                ...binding,
                input_status: checkout.status,
              });
        if (result.error) throw domainErrorFromDatabase(result.error);
        if (checkout.status === "expired" || checkout.status === "failed") continue;
        attached = true;
      }
      if (attached && (checkout.status === "expired" || checkout.status === "failed")) {
        const closed = await service.rpc("close_venue_billing_checkout", {
          input_attempt_id: context.attemptId,
          input_checkout_id: checkout.id,
          input_failure_code: checkout.status === "expired" ? "expired" : "provider_failed",
          input_request_id: requestId,
        });
        if (closed.error) throw domainErrorFromDatabase(closed.error);
        continue;
      }
      if (checkout.status !== "open" || Date.parse(checkout.expires_at) <= Date.now())
        throw pending();
      destination = checkout.url;
      break;
    }
    if (!destination!) throw pending();
  } catch (error) {
    return actionFailure(
      error instanceof DomainError || error instanceof z.ZodError ? error : pending(),
    );
  }
  redirect(destination);
}
