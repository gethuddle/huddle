import { beforeEach, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/errors";
import { billingEnvironment } from "@/tests/fixtures/polar-environment";
import {
  startVenueCheckoutAction,
  openVenueBillingPortalAction,
  openArchivedVenueBillingPortalAction,
} from "./actions";
import { activeVenueBilling } from "@/tests/fixtures/venue-billing";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  rpc: vi.fn(),
  service: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  redirect: vi.fn(),
  rejection: vi.fn(),
  portal: vi.fn(),
}));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ rpc: mocks.service }),
}));
vi.mock("@/lib/env/server", () => ({ getServerEnvironment: () => billingEnvironment() }));
vi.mock("@/lib/request-id/server", () => ({
  getRequestId: async () => "00000000-0000-4000-8000-000000000099",
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./polar", async (load) => ({
  ...(await load<typeof import("./polar")>()),
  createVenueCheckout: mocks.create,
  listVenueCheckouts: mocks.list,
  getVenueCheckout: mocks.get,
  isDefinitiveCheckoutRejection: mocks.rejection,
  createVenueCustomerSession: mocks.portal,
}));
const id = "00000000-0000-4000-8000-000000000010";
const product = "00000000-0000-4000-8000-000000000002";
it("opens archived portal using the authenticated owner and dedicated recovery return", async () => {
  mocks.rpc.mockResolvedValue({
    error: null,
    data: {
      venueId: id,
      name: "Closed venue",
      slug: "closed-venue",
      state: "expired",
      interval: "month",
      paidThroughAt: null,
      canOpenPortal: true,
    },
  });
  mocks.portal.mockResolvedValue({
    customer_portal_url: "https://sandbox.polar.sh/customer-portal/session",
  });
  await expect(
    openArchivedVenueBillingPortalAction({ slug: "closed-venue", ownerId: "forged" }),
  ).rejects.toThrow("redirect");
  expect(mocks.rpc).toHaveBeenCalledWith("get_archived_venue_billing_context", {
    input_slug: "closed-venue",
  });
  expect(mocks.portal).toHaveBeenCalledWith({
    ownerId: id,
    venueSlug: "closed-venue",
    returnTo: "archived",
  });
});
it.each([false, "https://polar.sh/customer-portal/session"])(
  "archived recovery rejects unavailable or unsafe portal %s",
  async (available) => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        venueId: id,
        name: "Closed venue",
        slug: "closed-venue",
        state: "expired",
        interval: null,
        paidThroughAt: null,
        canOpenPortal: available !== false,
      },
    });
    mocks.portal.mockResolvedValue({ customer_portal_url: available });
    expect(await openArchivedVenueBillingPortalAction({ slug: "closed-venue" })).toMatchObject({
      ok: false,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    if (!available) expect(mocks.portal).not.toHaveBeenCalled();
  },
);
it("opens a fresh portal only from the authorized actor and server workspace", async () => {
  mocks.rpc.mockImplementation(async (name) => ({
    error: null,
    data:
      name === "get_venue_billing_context"
        ? activeVenueBilling
        : [{ workspace_kind: "venue", workspace_id: id, slug: "test-venue" }],
  }));
  mocks.portal.mockResolvedValue({
    customer_portal_url: "https://sandbox.polar.sh/customer-portal/session",
  });
  await expect(
    openVenueBillingPortalAction({ venueId: id, ownerId: "forged", venueSlug: "forged" }),
  ).rejects.toThrow("redirect");
  expect(mocks.portal).toHaveBeenCalledWith({ ownerId: id, venueSlug: "test-venue" });
  expect(mocks.redirect).toHaveBeenCalledWith("https://sandbox.polar.sh/customer-portal/session");
});
it("denies an admin portal before contacting Polar", async () => {
  mocks.rpc.mockResolvedValue({
    error: null,
    data: { ...activeVenueBilling, canManageBilling: false, canOpenPortal: false },
  });
  expect(await openVenueBillingPortalAction({ venueId: id })).toMatchObject({ ok: false });
  expect(mocks.portal).not.toHaveBeenCalled();
});
it.each([
  "http://sandbox.polar.sh/session",
  "https://polar.sh/session",
  "https://sandbox.polar.sh.evil.test/session",
  "https://user:pass@sandbox.polar.sh/session",
  "https://sandbox.polar.sh/session#secret",
])("rejects unsafe portal destination %s without leaking it", async (url) => {
  mocks.rpc.mockImplementation(async (name) => ({
    error: null,
    data:
      name === "get_venue_billing_context"
        ? activeVenueBilling
        : [{ workspace_kind: "venue", workspace_id: id, slug: "test-venue" }],
  }));
  mocks.portal.mockResolvedValue({ customer_portal_url: url });
  const result = await openVenueBillingPortalAction({ venueId: id });
  expect(result).toMatchObject({ ok: false });
  expect(JSON.stringify(result)).not.toContain(url);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
let created = true;
let context: Record<string, unknown>;
let checkout: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  created = true;
  mocks.rejection.mockReturnValue(false);
  context = {
    attemptId: id,
    createdAt: new Date().toISOString(),
    interval: "month",
    state: "reserved",
    generation: 1,
    checkoutId: null,
    expiresAt: null,
    organizationId: null,
    productId: null,
    priceId: null,
    amount: null,
    currency: null,
    intervalCount: null,
    externalCustomerId: null,
  };
  checkout = {
    id,
    status: "open",
    created_at: new Date(),
    expires_at: new Date(Date.now() + 3600000),
    url: "https://sandbox.polar.sh/checkout/test",
    organization_id: billingEnvironment().POLAR_ORGANIZATION_ID,
    external_customer_id: id,
    product_id: product,
    product_price_id: id,
    amount: 1500,
    currency: "ils",
    metadata: { huddle_venue_id: id, huddle_checkout_attempt_id: id, huddle_schema_version: "1" },
    product: {
      id: product,
      organization_id: billingEnvironment().POLAR_ORGANIZATION_ID,
      recurring_interval: "month",
      recurring_interval_count: 1,
    },
    product_price: {
      id,
      product_id: product,
      amount_type: "fixed",
      price_amount: 1500,
      price_currency: "ils",
    },
  };
  mocks.actor.mockResolvedValue({
    user: { id, email: "owner@example.test", email_confirmed_at: "2026-01-01" },
    supabase: { rpc: mocks.rpc },
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "reserve_venue_billing_checkout"
        ? [{ attempt_id: id, generation: 1, created_by_this_call: created }]
        : [
            {
              workspace_kind: "venue",
              workspace_id: id,
              slug: "test-venue",
              name: "Test venue",
              role: "owner",
            },
          ],
  }));
  mocks.service.mockImplementation(async (name: string) => ({
    error: null,
    data: name === "get_venue_checkout_context" ? context : null,
  }));
  mocks.create.mockImplementation(async () => checkout);
  mocks.get.mockImplementation(async () => checkout);
  mocks.list.mockResolvedValue({ items: [], pagination: { total_count: 0, max_page: 1 } });
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
});
it("reserves and attaches server-owned binding before redirect", async () => {
  await expect(
    startVenueCheckoutAction({ venueId: id, plan: "monthly", customer: "evil" }),
  ).rejects.toThrow("redirect");
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerId: id,
      ownerEmail: "owner@example.test",
      attemptId: id,
      planKey: "monthly",
    }),
  );
  expect(mocks.service).toHaveBeenCalledWith(
    "attach_venue_billing_checkout",
    expect.objectContaining({
      input_attempt_id: id,
      input_checkout_id: id,
      input_amount: 1500,
      input_currency: "ils",
    }),
  );
  expect(mocks.service.mock.invocationCallOrder.at(-1)).toBeLessThan(
    mocks.redirect.mock.invocationCallOrder[0],
  );
});
it("owner denial prevents all provider calls", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "VENUE_BILLING_OWNER_REQUIRED" }, data: null });
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
    error: { code: "VENUE_BILLING_OWNER_REQUIRED" },
  });
  expect(mocks.create).not.toHaveBeenCalled();
});
it("a retry reconciles the immutable monthly plan despite yearly input", async () => {
  created = false;
  mocks.list.mockResolvedValue({ items: [checkout], pagination: { total_count: 1, max_page: 1 } });
  await expect(startVenueCheckoutAction({ venueId: id, plan: "yearly" })).rejects.toThrow(
    "redirect",
  );
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.list).toHaveBeenCalledWith({ ownerId: id, planKey: "monthly", page: 1 });
});
it("zero recent matches leaves a reserved attempt open", async () => {
  created = false;
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
    error: { code: "VENUE_BILLING_PENDING" },
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.service.mock.calls.some(([name]) => name === "fail_venue_billing_checkout")).toBe(
    false,
  );
});
it("unknown creation failure records uncertainty without leaking errors", async () => {
  mocks.create.mockRejectedValue(new Error("private provider detail"));
  const result = await startVenueCheckoutAction({ venueId: id, plan: "monthly" });
  expect(result).toMatchObject({ ok: false, error: { code: "VENUE_BILLING_PENDING" } });
  expect(JSON.stringify(result)).not.toContain("private provider");
  expect(mocks.service).toHaveBeenCalledWith("mark_venue_checkout_uncertain", {
    input_attempt_id: id,
  });
});
it("malformed complete response cannot attach or redirect", async () => {
  checkout.amount = 1;
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
  });
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.service.mock.calls.some(([name]) => name === "attach_venue_billing_checkout")).toBe(
    false,
  );
});
it("expired zero-match search closes only after a fresh second lookup", async () => {
  created = false;
  context.createdAt = new Date(Date.now() - 16 * 60000).toISOString();
  await startVenueCheckoutAction({ venueId: id, plan: "monthly" });
  expect(mocks.list).toHaveBeenCalledTimes(2);
  expect(mocks.service).toHaveBeenCalledWith(
    "fail_venue_billing_checkout",
    expect.objectContaining({ input_failure_code: "not_created_after_timeout" }),
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("multiple exact matches prevent creating or attaching", async () => {
  created = false;
  mocks.list.mockResolvedValue({
    items: [checkout, { ...checkout, id: "00000000-0000-4000-8000-000000000011" }],
    pagination: { total_count: 2, max_page: 1 },
  });
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("authentication failure does not reach provider", async () => {
  mocks.actor.mockRejectedValue(new DomainError("AUTH_REQUIRED"));
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
    error: { code: "AUTH_REQUIRED" },
  });
  expect(mocks.create).not.toHaveBeenCalled();
});

function bindAttached(status: string) {
  created = false;
  Object.assign(context, {
    state: "attached",
    checkoutId: id,
    expiresAt: (checkout.expires_at as Date).toISOString(),
    organizationId: checkout.organization_id,
    productId: product,
    priceId: id,
    amount: 1500,
    currency: "ils",
    intervalCount: 1,
    externalCustomerId: id,
  });
  checkout.status = status;
}
it.each(["confirmed", "succeeded"])(
  "attached %s grants nothing and creates nothing",
  async (status) => {
    bindAttached(status);
    expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
      ok: false,
      error: { code: "VENUE_BILLING_PENDING" },
    });
    expect(mocks.get).toHaveBeenCalledWith(id);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  },
);
it("attached open checkout reuses its validated URL", async () => {
  bindAttached("open");
  await expect(startVenueCheckoutAction({ venueId: id, plan: "yearly" })).rejects.toThrow(
    "redirect",
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("attached transport failure releases nothing", async () => {
  bindAttached("open");
  mocks.get.mockRejectedValue({ statusCode: 404 });
  await startVenueCheckoutAction({ venueId: id, plan: "monthly" });
  expect(mocks.service.mock.calls.map(([name]) => name)).toEqual(["get_venue_checkout_context"]);
});
it("recovered elapsed succeeded checkout persists binding but stays pending", async () => {
  created = false;
  checkout.status = "succeeded";
  checkout.expires_at = new Date(Date.now() - 1000);
  mocks.list.mockResolvedValue({ items: [checkout], pagination: { total_count: 1, max_page: 1 } });
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
    error: { code: "VENUE_BILLING_PENDING" },
  });
  expect(mocks.service).toHaveBeenCalledWith(
    "reconcile_venue_billing_checkout",
    expect.objectContaining({ input_status: "succeeded" }),
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("exact metadata with wrong binding is never absence proof", async () => {
  created = false;
  context.createdAt = new Date(Date.now() - 16 * 60000).toISOString();
  checkout.amount = 1;
  mocks.list.mockResolvedValue({ items: [checkout], pagination: { total_count: 1, max_page: 1 } });
  await startVenueCheckoutAction({ venueId: id, plan: "monthly" });
  expect(mocks.service.mock.calls.some(([name]) => name === "fail_venue_billing_checkout")).toBe(
    false,
  );
});
it("an incomplete bounded search cannot release an old reservation", async () => {
  created = false;
  context.createdAt = new Date(Date.now() - 16 * 60000).toISOString();
  mocks.list.mockResolvedValue({ items: [], pagination: { total_count: 1100, max_page: 11 } });
  await startVenueCheckoutAction({ venueId: id, plan: "monthly" });
  expect(mocks.service.mock.calls.some(([name]) => name === "fail_venue_billing_checkout")).toBe(
    false,
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("validated rejection closes the attempt with only a bounded code", async () => {
  mocks.create.mockRejectedValue(new Error("sensitive rejection"));
  mocks.rejection.mockReturnValue(true);
  expect(await startVenueCheckoutAction({ venueId: id, plan: "monthly" })).toMatchObject({
    ok: false,
    error: { code: "UPSTREAM_UNAVAILABLE" },
  });
  expect(mocks.service).toHaveBeenCalledWith(
    "fail_venue_billing_checkout",
    expect.objectContaining({ input_failure_code: "request_rejected" }),
  );
  expect(mocks.service.mock.calls.some(([name]) => name === "mark_venue_checkout_uncertain")).toBe(
    false,
  );
});
it.each(["expired", "failed"])(
  "recovered %s closes before a fresh generation can create",
  async (status) => {
    created = false;
    context.interval = "year";
    const yearlyProduct = "00000000-0000-4000-8000-000000000003";
    checkout = {
      ...checkout,
      amount: 15000,
      product_id: yearlyProduct,
      product: {
        id: yearlyProduct,
        organization_id: checkout.organization_id,
        recurring_interval: "year",
        recurring_interval_count: 1,
      },
      product_price: {
        id,
        product_id: yearlyProduct,
        amount_type: "fixed",
        price_amount: 15000,
        price_currency: "ils",
      },
    };
    checkout.status = status;
    checkout.expires_at = new Date(Date.now() - 1000);
    mocks.list.mockResolvedValue({
      items: [checkout],
      pagination: { total_count: 1, max_page: 1 },
    });
    mocks.service.mockImplementation(async (name: string) => {
      if (name === "reconcile_venue_billing_checkout") {
        created = true;
        context = { ...context, attemptId: "00000000-0000-4000-8000-000000000011", generation: 2 };
        checkout = {
          ...checkout,
          status: "open",
          expires_at: new Date(Date.now() + 3600000),
          metadata: {
            huddle_venue_id: id,
            huddle_checkout_attempt_id: context.attemptId,
            huddle_schema_version: "1",
          },
        };
      }
      return { data: name === "get_venue_checkout_context" ? context : null, error: null };
    });
    mocks.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === "reserve_venue_billing_checkout"
          ? [
              {
                attempt_id: context.attemptId,
                generation: context.generation,
                created_by_this_call: created,
              },
            ]
          : [{ workspace_kind: "venue", workspace_id: id, slug: "test-venue" }],
    }));
    await expect(startVenueCheckoutAction({ venueId: id, plan: "monthly" })).rejects.toThrow(
      "redirect",
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === "reserve_venue_billing_checkout")[1][1],
    ).toMatchObject({ input_interval: "year" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ planKey: "yearly" }));
    const closedIndex = mocks.service.mock.calls.findIndex(
      ([name]) => name === "reconcile_venue_billing_checkout",
    );
    expect(mocks.service.mock.invocationCallOrder[closedIndex]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    );
  },
);
it("inconsistent pagination counts cannot prove checkout absence", async () => {
  created = false;
  context.createdAt = new Date(Date.now() - 16 * 60000).toISOString();
  mocks.list.mockResolvedValue({ items: [], pagination: { total_count: 10, max_page: 1 } });
  await startVenueCheckoutAction({ venueId: id, plan: "monthly" });
  expect(mocks.service.mock.calls.some(([name]) => name === "fail_venue_billing_checkout")).toBe(
    false,
  );
});

it.each(["expired", "failed"])(
  "attached %s closes its exact checkout before reserving and creating the same annual plan",
  async (status) => {
    const yearlyProduct = "00000000-0000-4000-8000-000000000003";
    const originalCheckoutId = "00000000-0000-4000-8000-000000000013";
    const freshAttemptId = "00000000-0000-4000-8000-000000000011";
    const freshCheckoutId = "00000000-0000-4000-8000-000000000012";
    checkout = {
      ...checkout,
      amount: 15000,
      product_id: yearlyProduct,
      expires_at: new Date(Date.now() - 1000),
      id: originalCheckoutId,
      product: {
        id: yearlyProduct,
        organization_id: checkout.organization_id,
        recurring_interval: "year",
        recurring_interval_count: 1,
      },
      product_price: {
        id,
        product_id: yearlyProduct,
        amount_type: "fixed",
        price_amount: 15000,
        price_currency: "ils",
      },
    };
    bindAttached(status);
    Object.assign(context, {
      interval: "year",
      productId: yearlyProduct,
      amount: 15000,
      checkoutId: originalCheckoutId,
    });
    mocks.service.mockImplementation(async (name: string) => {
      if (name === "close_venue_billing_checkout") {
        created = true;
        context = {
          ...context,
          attemptId: freshAttemptId,
          generation: 2,
          state: "reserved",
          checkoutId: null,
          expiresAt: null,
          organizationId: null,
          productId: null,
          priceId: null,
          amount: null,
          currency: null,
          intervalCount: null,
          externalCustomerId: null,
        };
        checkout = {
          ...checkout,
          id: freshCheckoutId,
          status: "open",
          expires_at: new Date(Date.now() + 3600000),
          metadata: {
            huddle_venue_id: id,
            huddle_checkout_attempt_id: freshAttemptId,
            huddle_schema_version: "1",
          },
        };
      }
      return { data: name === "get_venue_checkout_context" ? context : null, error: null };
    });
    mocks.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === "reserve_venue_billing_checkout"
          ? [
              {
                attempt_id: context.attemptId,
                generation: context.generation,
                created_by_this_call: created,
              },
            ]
          : [{ workspace_kind: "venue", workspace_id: id, slug: "test-venue" }],
    }));

    await expect(startVenueCheckoutAction({ venueId: id, plan: "monthly" })).rejects.toThrow(
      "redirect",
    );
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(originalCheckoutId);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.service).toHaveBeenCalledWith("close_venue_billing_checkout", {
      input_attempt_id: id,
      input_checkout_id: originalCheckoutId,
      input_failure_code: status === "expired" ? "expired" : "provider_failed",
      input_request_id: "00000000-0000-4000-8000-000000000099",
    });
    expect(
      mocks.service.mock.calls.some(([name]) => name === "reconcile_venue_billing_checkout"),
    ).toBe(false);
    const closeIndex = mocks.service.mock.calls.findIndex(
      ([name]) => name === "close_venue_billing_checkout",
    );
    const reserveIndices = mocks.rpc.mock.calls.flatMap(([name], index) =>
      name === "reserve_venue_billing_checkout" ? [index] : [],
    );
    expect(reserveIndices).toHaveLength(2);
    expect(mocks.service.mock.invocationCallOrder[closeIndex]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[reserveIndices[1]],
    );
    expect(mocks.rpc.mock.calls[reserveIndices[1]][1]).toMatchObject({ input_interval: "year" });
    expect(mocks.rpc.mock.invocationCallOrder[reserveIndices[1]]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    );
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ attemptId: freshAttemptId, planKey: "yearly" }),
    );
    expect(mocks.service).toHaveBeenCalledWith(
      "attach_venue_billing_checkout",
      expect.objectContaining({
        input_attempt_id: freshAttemptId,
        input_checkout_id: freshCheckoutId,
        input_interval: "year",
        input_amount: 15000,
      }),
    );
  },
);
