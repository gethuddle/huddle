import "server-only";

import { createPolar, errors } from "@polar-sh/sdk/2026-04";
import { z } from "zod";

import type { ServerEnvironment } from "@/lib/env/schema";
import { getServerEnvironment } from "@/lib/env/server";

import { POLAR_API_TIMEOUT_SECONDS } from "./constants";
import { getVenueBillingPlan } from "./plans";
import { venueBillingPlanKeySchema } from "./types";

const ownerSchema = z.object({ ownerId: z.uuid() }).strict();
const portalSchema = ownerSchema
  .extend({
    venueSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    returnTo: z.enum(["workspace", "archived"]).optional(),
  })
  .strict();
const checkoutSchema = portalSchema
  .omit({ returnTo: true })
  .extend({
    ownerEmail: z.email(),
    venueId: z.uuid(),
    attemptId: z.uuid(),
    planKey: venueBillingPlanKeySchema,
  })
  .strict();
const lookupSchema = ownerSchema
  .extend({ planKey: venueBillingPlanKeySchema, page: z.number().int().min(1).max(10) })
  .strict();

export function isDefinitiveCheckoutRejection(error: unknown): boolean {
  // The SDK's typed errors do not validate JSON at runtime. Accept only its
  // documented create-422 envelope; arbitrary status objects stay uncertain.
  return (
    error instanceof errors.HTTPValidationError &&
    error.statusCode === 422 &&
    z
      .object({
        detail: z
          .array(
            z.object({
              loc: z.array(z.union([z.string(), z.number()])),
              msg: z.string().min(1),
              type: z.string().min(1),
            }),
          )
          .min(1),
      })
      .safeParse(error.error).success
  );
}

function getPolarClient(
  environment: ServerEnvironment = getServerEnvironment(),
): ReturnType<typeof createPolar> {
  // Process-level denial cannot be overridden by an injected server environment.
  if (
    process.env.HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK === "true" ||
    environment.HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK
  ) {
    throw new Error("Polar network is disabled");
  }
  return createPolar({ accessToken: environment.POLAR_ACCESS_TOKEN, environment: "sandbox" });
}

// These inputs are trusted server state, not a browser/action contract. Callers
// must authenticate the exact owner and reserve/authorize the operation first.
export async function createVenueCheckout(
  input: z.infer<typeof checkoutSchema>,
  environment: ServerEnvironment = getServerEnvironment(),
) {
  const client = getPolarClient(environment);
  const args = checkoutSchema.parse(input);
  const plan = getVenueBillingPlan(args.planKey, environment);
  const billingUrl = new URL(
    `/venues/${args.venueSlug}/workspace/billing`,
    environment.NEXT_PUBLIC_APP_URL,
  ).href;
  return client.checkouts.create(
    {
      products: [plan.polarProductId],
      external_customer_id: args.ownerId,
      customer_email: args.ownerEmail,
      allow_trial: false,
      allow_discount_codes: false,
      metadata: {
        huddle_venue_id: args.venueId,
        huddle_checkout_attempt_id: args.attemptId,
        huddle_schema_version: "1",
      },
      success_url: `${billingUrl}/return?checkout_id={CHECKOUT_ID}`,
      return_url: billingUrl,
    },
    { timeout: POLAR_API_TIMEOUT_SECONDS },
  );
}

export async function listVenueCheckouts(
  input: z.infer<typeof lookupSchema>,
  environment: ServerEnvironment = getServerEnvironment(),
) {
  const client = getPolarClient(environment);
  const args = lookupSchema.parse(input);
  return client.checkouts.list(
    {
      organization_id: environment.POLAR_ORGANIZATION_ID,
      external_customer_id: args.ownerId,
      product_id: getVenueBillingPlan(args.planKey, environment).polarProductId,
      page: args.page,
      limit: 100,
      sorting: ["-created_at"],
    },
    { timeout: POLAR_API_TIMEOUT_SECONDS },
  );
}

export async function getVenueCheckout(
  checkoutId: string,
  environment: ServerEnvironment = getServerEnvironment(),
) {
  const client = getPolarClient(environment);
  return client.checkouts.get(z.uuid().parse(checkoutId), { timeout: POLAR_API_TIMEOUT_SECONDS });
}

export async function createVenueCustomerSession(
  input: z.infer<typeof portalSchema>,
  environment: ServerEnvironment = getServerEnvironment(),
) {
  const client = getPolarClient(environment);
  const args = portalSchema.parse(input);
  return client.customerSessions.create(
    {
      external_customer_id: args.ownerId,
      return_url: new URL(
        `/venues/${args.venueSlug}/${args.returnTo === "archived" ? "billing" : "workspace/billing"}`,
        environment.NEXT_PUBLIC_APP_URL,
      ).href,
    },
    { timeout: POLAR_API_TIMEOUT_SECONDS },
  );
}

export async function getVenueSubscription(
  subscriptionId: string,
  environment: ServerEnvironment = getServerEnvironment(),
) {
  const client = getPolarClient(environment);
  return client.subscriptions.get(z.uuid().parse(subscriptionId), {
    timeout: POLAR_API_TIMEOUT_SECONDS,
  });
}

// Import-boundary checks reserve this capability for account erasure and its
// late-event cleanup. Ordinary billing actions must never import it.
export async function erasePolarExternalCustomer(
  ownerId: string,
  environment: ServerEnvironment = getServerEnvironment(),
): Promise<void> {
  const client = getPolarClient(environment);
  try {
    await client.customers.deleteExternal(
      z.uuid().parse(ownerId),
      { anonymize: true },
      { timeout: POLAR_API_TIMEOUT_SECONDS },
    );
  } catch (error) {
    if (error instanceof errors.ResourceNotFound && error.statusCode === 404) return;
    throw error;
  }
}
