import { createPolarCore, type createPolar, webhooks } from "@polar-sh/sdk/2026-04";
import { afterEach, expect, expectTypeOf, it, vi } from "vitest";

import { billingEnvironment } from "@/tests/fixtures/polar-environment";
import {
  createVenueCheckout,
  listVenueCheckouts,
  getVenueCheckout,
  createVenueCustomerSession,
  getVenueSubscription,
  erasePolarExternalCustomer,
  isDefinitiveCheckoutRejection,
} from "./polar";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ownerId = "00000000-0000-4000-8000-000000000010";
const venueId = "00000000-0000-4000-8000-000000000011";
const attemptId = "00000000-0000-4000-8000-000000000012";
const checkoutInput = {
  ownerId,
  ownerEmail: "owner@example.test",
  venueId,
  venueSlug: "test-venue",
  attemptId,
  planKey: "monthly" as const,
};
it("returns an archived customer's session to recovery outside the removed workspace", async () => {
  const { fetchSpy } = sdkTransport();
  await createVenueCustomerSession(
    { ownerId, venueSlug: "test-venue", returnTo: "archived" },
    billingEnvironment(),
  ).catch(() => {});
  expect(fetchSpy).toHaveBeenCalledOnce();
  const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
  expect(body.return_url).toBe("http://localhost:3000/venues/test-venue/billing");
});

it("recognizes only an actual SDK validation rejection with a validated detail body", async () => {
  const { fetchSpy } = sdkTransport(422);
  fetchSpy.mockResolvedValue(
    new Response(
      JSON.stringify({
        detail: [{ loc: ["body", "products"], msg: "Invalid", type: "value_error" }],
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  );
  const rejected = await createVenueCheckout(checkoutInput, billingEnvironment()).catch(
    (e: unknown) => e,
  );
  expect(isDefinitiveCheckoutRejection(rejected)).toBe(true);
  expect(isDefinitiveCheckoutRejection({ statusCode: 422, error: { detail: [] } })).toBe(false);
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ secret: "bad body" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
  );
  expect(
    isDefinitiveCheckoutRejection(
      await createVenueCheckout(checkoutInput, billingEnvironment()).catch((e: unknown) => e),
    ),
  ).toBe(false);
});

function sdkTransport(status = 400) {
  vi.stubEnv("HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK", "false");
  // Keep the pinned SDK's serializers, URL builder, options and errors real.
  // Only its external transport is replaced; no real provider request is possible.
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ detail: "controlled response" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const core = createPolarCore({ accessToken: "local-test-token", environment: "sandbox" });
  const sendRequest = vi.spyOn(Object.getPrototypeOf(core) as typeof core, "sendRequest");
  const timeout = vi.spyOn(AbortSignal, "timeout");
  return { fetchSpy, sendRequest, timeout };
}

it("uses actual SDK snake_case requests with server-owned Sandbox fields and five-second options on all six methods", async () => {
  const { fetchSpy, sendRequest, timeout } = sdkTransport();
  const environment = billingEnvironment();
  const calls = [
    () => createVenueCheckout(checkoutInput, environment),
    () => listVenueCheckouts({ ownerId, planKey: "yearly", page: 2 }, environment),
    () => getVenueCheckout(attemptId, environment),
    () => createVenueCustomerSession({ ownerId, venueSlug: "test-venue" }, environment),
    () => getVenueSubscription(attemptId, environment),
    () => erasePolarExternalCustomer(ownerId, environment),
  ];
  for (const call of calls) await expect(call()).rejects.toThrow();
  expect(sendRequest.mock.calls).toHaveLength(6);
  for (const [, options] of sendRequest.mock.calls) expect(options).toEqual({ timeout: 5 });
  expect(timeout.mock.calls).toEqual(Array.from({ length: 6 }, () => [5000]));
  const requests = fetchSpy.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));
  for (const request of requests) expect(request.url.origin).toBe("https://sandbox-api.polar.sh");
  expect(requests.map(({ url, method }) => [url.pathname, method])).toEqual([
    ["/v1/checkouts/", "POST"],
    ["/v1/checkouts/", "GET"],
    [`/v1/checkouts/${attemptId}`, "GET"],
    ["/v1/customer-sessions/", "POST"],
    [`/v1/subscriptions/${attemptId}`, "GET"],
    [`/v1/customers/external/${ownerId}`, "DELETE"],
  ]);
  expect(requests[0].body).toEqual({
    products: ["00000000-0000-4000-8000-000000000002"],
    external_customer_id: ownerId,
    customer_email: "owner@example.test",
    allow_trial: false,
    allow_discount_codes: false,
    metadata: {
      huddle_venue_id: venueId,
      huddle_checkout_attempt_id: attemptId,
      huddle_schema_version: "1",
    },
    success_url:
      "http://localhost:3000/venues/test-venue/workspace/billing/return?checkout_id={CHECKOUT_ID}",
    return_url: "http://localhost:3000/venues/test-venue/workspace/billing",
  });
  expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({
    organization_id: "00000000-0000-4000-8000-000000000001",
    external_customer_id: ownerId,
    product_id: "00000000-0000-4000-8000-000000000003",
    page: "2",
    limit: "100",
    sorting: "-created_at",
  });
  expect(requests[3].body).toEqual({
    external_customer_id: ownerId,
    return_url: "http://localhost:3000/venues/test-venue/workspace/billing",
  });
  expect(requests[5].url.search).toBe("?anonymize=true");
});

it.each([204, 404])(
  "treats actual SDK external-customer deletion status %s as complete",
  async (status) => {
    const { fetchSpy } = sdkTransport(status);
    if (status === 204) fetchSpy.mockResolvedValue(new Response(null, { status }));
    await expect(
      erasePolarExternalCustomer(ownerId, billingEnvironment()),
    ).resolves.toBeUndefined();
  },
);

it.each([401, 403, 429, 500])(
  "does not conceal external-customer deletion status %s",
  async (status) => {
    sdkTransport(status);
    await expect(erasePolarExternalCustomer(ownerId, billingEnvironment())).rejects.toThrow();
  },
);

it("does not treat a checkout 404 as terminal success", async () => {
  sdkTransport(404);
  await expect(getVenueCheckout(attemptId, billingEnvironment())).rejects.toThrow();
});

it.each([
  "amount",
  "products",
  "customer_id",
  "organization_id",
  "metadata",
  "environment",
  "success_url",
])("rejects caller-controlled provider field %s before transport", async (key) => {
  const { fetchSpy } = sdkTransport();
  await expect(
    createVenueCheckout({ ...checkoutInput, [key]: "untrusted" }, billingEnvironment()),
  ).rejects.toThrow();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("preserves the exact async SDK webhook and deletion compile contracts", () => {
  expectTypeOf<keyof typeof import("./polar")>().toEqualTypeOf<
    | "createVenueCheckout"
    | "listVenueCheckouts"
    | "getVenueCheckout"
    | "createVenueCustomerSession"
    | "getVenueSubscription"
    | "erasePolarExternalCustomer"
    | "isDefinitiveCheckoutRejection"
  >();
  type Client = ReturnType<typeof createPolar>;
  expectTypeOf<ReturnType<typeof webhooks.validateEvent>>().toEqualTypeOf<
    Promise<webhooks.WebhookPayload>
  >();
  expectTypeOf<Parameters<Client["customers"]["deleteExternal"]>>().toEqualTypeOf<
    [external_id: string, query?: { anonymize?: boolean }, requestOptions?: { timeout?: number }]
  >();
  const checkout: Parameters<Client["checkouts"]["create"]>[0] = {
    products: ["product"],
    external_customer_id: ownerId,
    customer_email: "owner@example.test",
    success_url: "https://example.test/return",
    metadata: { huddle_schema_version: "1" },
  };
  const session: Parameters<Client["customerSessions"]["create"]>[0] = {
    external_customer_id: ownerId,
    return_url: "https://example.test/billing",
  };
  expect(checkout.external_customer_id).toBe(session.external_customer_id);
  expectTypeOf<keyof Parameters<typeof createVenueCheckout>[0]>().toEqualTypeOf<
    "ownerId" | "ownerEmail" | "venueId" | "venueSlug" | "attemptId" | "planKey"
  >();
});

it("denies every provider operation during automation before network access", async () => {
  const { fetchSpy, sendRequest } = sdkTransport();
  vi.stubEnv("HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK", "true");
  const environment = billingEnvironment();
  const ownerId = "00000000-0000-4000-8000-000000000010";
  const calls = [
    () =>
      createVenueCheckout(
        {
          ownerId,
          ownerEmail: "owner@example.test",
          venueId: ownerId,
          venueSlug: "test-venue",
          attemptId: ownerId,
          planKey: "monthly",
        },
        environment,
      ),
    () => listVenueCheckouts({ ownerId, planKey: "monthly", page: 1 }, environment),
    () => getVenueCheckout(ownerId, environment),
    () => createVenueCustomerSession({ ownerId, venueSlug: "test-venue" }, environment),
    () => getVenueSubscription(ownerId, environment),
    () => erasePolarExternalCustomer(ownerId, environment),
  ];
  for (const call of calls) await expect(call()).rejects.toThrow("Polar network is disabled");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(sendRequest).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

it("an explicit server environment can only add network denial", async () => {
  const { fetchSpy } = sdkTransport();
  const environment = { ...billingEnvironment(), HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: true };
  await expect(getVenueCheckout(attemptId, environment)).rejects.toThrow(
    "Polar network is disabled",
  );
  expect(fetchSpy).not.toHaveBeenCalled();
});
