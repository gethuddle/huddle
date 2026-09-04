import { beforeEach, expect, it, vi } from "vitest";
import {
  getVenueBillingContext,
  getVenueCheckoutReturn,
  getArchivedVenueBillingContext,
} from "./queries";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  service: vi.fn(),
}));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ rpc: mocks.service }),
}));
const id = "00000000-0000-4000-8000-000000000010";
it("reads archived recovery through the dedicated owner-only RPC and rejects provider data", async () => {
  const archived = {
    venueId: id,
    name: "Closed venue",
    slug: "closed-venue",
    state: "expired",
    interval: "month",
    paidThroughAt: null,
    canOpenPortal: true,
  };
  mocks.rpc.mockResolvedValue({ data: archived, error: null });
  expect(await getArchivedVenueBillingContext("closed-venue")).toEqual(archived);
  expect(mocks.rpc).toHaveBeenCalledWith("get_archived_venue_billing_context", {
    input_slug: "closed-venue",
  });
  mocks.rpc.mockResolvedValue({
    data: { ...archived, polar_subscription_id: "secret" },
    error: null,
  });
  await expect(getArchivedVenueBillingContext("closed-venue")).rejects.toThrow();
});
const safe = {
  state: "confirming",
  interval: null,
  checkoutPending: true,
  paidThroughAt: null,
  graceExpiresAt: null,
  publishCutoffAt: null,
  isPublic: false,
  canPublish: false,
  canPrepareDrafts: true,
  canOperateExistingEvents: true,
  canManageBilling: true,
  canStartCheckout: false,
  canOpenPortal: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ user: { id }, supabase: { rpc: mocks.rpc } });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: safe, error: null });
  mocks.service.mockResolvedValue({
    data: {
      attemptId: id,
      createdAt: "2026-09-03T00:00:00Z",
      interval: "month",
      state: "attached",
      generation: 1,
      checkoutId: id,
      expiresAt: "2026-09-03T01:00:00Z",
      organizationId: id,
      productId: id,
      priceId: id,
      amount: 1500,
      currency: "ils",
      intervalCount: 1,
      externalCustomerId: id,
    },
    error: null,
  });
});
it("only accepts the safe 13-field projection", async () => {
  expect(await getVenueBillingContext(id)).toEqual(safe);
  expect(mocks.createClient).toHaveBeenCalledOnce();
  expect(mocks.actor).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: { ...safe, polar_subscription_id: "private" }, error: null });
  await expect(getVenueBillingContext(id)).rejects.toThrow();
});
it("checkout completion without local activation remains confirming with no mutations", async () => {
  expect(await getVenueCheckoutReturn(id, id)).toBe("confirming");
  expect(mocks.service).toHaveBeenCalledWith("get_venue_checkout_context", {
    input_actor_id: id,
    input_venue_id: id,
    input_attempt_id: null,
    input_checkout_id: id,
  });
  expect(mocks.rpc.mock.calls.every(([name]) => name === "get_venue_billing_context")).toBe(true);
});
it.each(["active", "canceling"])(
  "local %s public entitlement confirms readiness",
  async (state) => {
    mocks.rpc.mockResolvedValue({ data: { ...safe, state, isPublic: true }, error: null });
    expect(await getVenueCheckoutReturn(id, id)).toBe("active");
  },
);
it("mismatched return cannot borrow an active venue state", async () => {
  mocks.service.mockResolvedValue({ data: null, error: { message: "NOT_FOUND" } });
  await expect(getVenueCheckoutReturn(id, id)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
