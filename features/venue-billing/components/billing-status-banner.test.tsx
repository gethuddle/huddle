// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { activeVenueBilling } from "@/tests/fixtures/venue-billing";
import { BillingStatusBanner } from "./billing-status-banner";

const navigation = vi.hoisted(() => ({ pathname: "/venues/corner/workspace" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
beforeEach(() => {
  navigation.pathname = "/venues/corner/workspace";
});

it("does not warn globally for an active venue", () => {
  render(<BillingStatusBanner context={activeVenueBilling} slug="corner" />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([
  "payment_required",
  "confirming",
  "past_due",
  "provider_stale",
  "legacy_grace",
  "canceling",
  "expired",
] as const)(
  "explains %s without directing the user to the Billing page they already opened",
  (state) => {
    navigation.pathname = "/venues/corner/workspace/billing";
    render(
      <BillingStatusBanner
        context={{ ...activeVenueBilling, state, graceExpiresAt: "2026-10-01T21:00:00Z" }}
        slug="corner"
      />,
    );
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open Billing" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(/(?:Open|Check) Billing/);
  },
);

it("keeps useful Billing navigation on the checkout-return page", () => {
  navigation.pathname = "/venues/corner/workspace/billing/return";
  render(
    <BillingStatusBanner context={{ ...activeVenueBilling, state: "confirming" }} slug="corner" />,
  );
  expect(screen.getByRole("link", { name: "Open Billing" })).toHaveAttribute(
    "href",
    "/venues/corner/workspace/billing",
  );
});
it.each([
  ["payment_required", /Your venue is private/],
  ["confirming", /confirming your demo subscription/],
  ["past_due", /venue and events are hidden.*2 Oct 2026, 00:00/],
  ["provider_stale", /confirming your demo subscription.*hidden/],
  ["legacy_grace", /Choose a demo plan by 2 Oct 2026, 00:00/],
  ["canceling", /Events from that date onward are hidden/],
  ["expired", /recover the existing demo subscription/],
] as const)("explains %s privately and links to this venue's Billing", (state, message) => {
  render(
    <BillingStatusBanner
      context={{
        ...activeVenueBilling,
        state,
        checkoutPending: true,
        graceExpiresAt: "2026-10-01T21:00:00Z",
      }}
      slug="corner"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(message);
  expect(screen.getByRole("link", { name: /Billing/ })).toHaveAttribute(
    "href",
    "/venues/corner/workspace/billing",
  );
  expect(screen.queryByText(/payment failed/i)).not.toBeInTheDocument();
});
