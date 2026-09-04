// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { activeVenueBilling, expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import { VenueBillingPanel } from "./venue-billing-panel";
const portal = vi.hoisted(() => vi.fn());
const checkout = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({
  openVenueBillingPortalAction: portal,
  startVenueCheckoutAction: checkout,
}));

it("lets the exact owner reconcile an existing checkout without selecting a new plan", async () => {
  checkout.mockResolvedValue({
    ok: false,
    error: { code: "VENUE_BILLING_PENDING", message: "Still confirming." },
  });
  render(
    <VenueBillingPanel
      venueId="venue"
      context={{
        ...activeVenueBilling,
        state: "confirming",
        canStartCheckout: false,
        canOpenPortal: false,
        checkoutPending: true,
      }}
    />,
  );
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Continue to demo checkout" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Check checkout" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Still confirming.");
  expect(checkout).toHaveBeenCalledWith({ venueId: "venue", plan: "monthly" });
});
it("never exposes checkout reconciliation to an admin", () => {
  render(
    <VenueBillingPanel
      venueId="venue"
      context={{
        ...activeVenueBilling,
        state: "legacy_grace",
        checkoutPending: true,
        canManageBilling: false,
        canStartCheckout: false,
        canOpenPortal: false,
      }}
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows only portal recovery for expired nonterminal subscription and a safe failure", async () => {
  portal.mockResolvedValue({
    ok: false,
    error: { code: "UPSTREAM_UNAVAILABLE", message: "Please try again." },
  });
  render(<VenueBillingPanel context={expiredVenueBilling} venueId="venue" />);
  expect(screen.queryByRole("button", { name: /checkout/i })).not.toBeInTheDocument();
  expect(screen.getByText(/Polar Sandbox/)).toBeVisible();
  expect(screen.getByText(/No real money will be charged/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Open billing portal/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
  expect(portal).toHaveBeenCalledWith({ venueId: "venue" });
});
it("offers checkout only after a terminal binding release", () => {
  render(
    <VenueBillingPanel
      context={{ ...expiredVenueBilling, canOpenPortal: false, canStartCheckout: true }}
      venueId="venue"
    />,
  );
  expect(screen.getByRole("button", { name: /Continue to demo checkout/ })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /portal/ })).not.toBeInTheDocument();
});
it.each([
  "payment_required",
  "confirming",
  "active",
  "canceling",
  "past_due",
  "provider_stale",
  "legacy_grace",
  "expired",
] as const)("shows %s status but no billing action to an admin", (state) => {
  render(
    <VenueBillingPanel
      context={{
        ...activeVenueBilling,
        state,
        canManageBilling: false,
        canOpenPortal: false,
        canStartCheckout: false,
      }}
      venueId="venue"
    />,
  );
  expect(screen.getByText(/Only the venue owner can manage billing/)).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it.each([
  ["payment_required", true, false, "Continue to demo checkout"],
  ["confirming", false, false, null],
  ["active", false, true, "Open billing portal"],
  ["canceling", false, true, "Open billing portal"],
  ["past_due", false, true, "Open billing portal"],
  ["provider_stale", false, true, "Open billing portal"],
  ["legacy_grace", true, false, "Continue to demo checkout"],
] as const)(
  "uses the exact owner capabilities for %s",
  (state, canStartCheckout, canOpenPortal, action) => {
    render(
      <VenueBillingPanel
        venueId="venue"
        context={{ ...activeVenueBilling, state, canStartCheckout, canOpenPortal }}
      />,
    );
    if (action) expect(screen.getByRole("button", { name: action })).toBeEnabled();
    else expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);
