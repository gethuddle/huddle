// @vitest-environment jsdom

import { Component, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";
import { activeVenueBilling } from "@/tests/fixtures/venue-billing";
import { ArchivedVenueBillingControl } from "./archived-venue-billing-control";
import { VenueBillingPanel } from "./venue-billing-panel";
import { VenuePlanPicker } from "./venue-plan-picker";

const action = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({
  startVenueCheckoutAction: action,
  openVenueBillingPortalAction: action,
  openArchivedVenueBillingPortalAction: action,
}));

class NavigationBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };
  static getDerivedStateFromError() {
    return { caught: true };
  }
  render() {
    return this.state.caught ? <p>Navigation handed to framework</p> : this.props.children;
  }
}

beforeEach(() => {
  action.mockReset();
});

const cases = [
  ["checkout", () => <VenuePlanPicker venueId="venue" pendingCheckout={false} />],
  ["portal", () => <VenueBillingPanel venueId="venue" context={activeVenueBilling} />],
  ["archived portal", () => <ArchivedVenueBillingControl slug="archived" />],
] as const;

it.each(cases)(
  "hands a successful %s redirect back to Next without showing failure",
  async (_, view) => {
    action.mockImplementation(async () => redirect("https://sandbox.example.test/checkout"));
    const caught = vi.fn();
    render(<NavigationBoundary>{view()}</NavigationBoundary>, { onCaughtError: caught });
    await userEvent.click(screen.getByRole("button", { name: /checkout|portal/i }));
    expect(await screen.findByText("Navigation handed to framework")).toBeVisible();
    expect(caught).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it.each(cases)("shows a safe %s transport failure and allows retry", async (_, view) => {
  action.mockRejectedValue(new Error("private provider diagnostic"));
  render(view());
  await userEvent.click(screen.getByRole("button", { name: /checkout|portal/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not open/i);
  expect(document.body).not.toHaveTextContent("private provider diagnostic");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /checkout|portal/i })).toBeEnabled(),
  );
});
