// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { VenuePlanPicker } from "./venue-plan-picker";
const start = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({ startVenueCheckoutAction: start }));
beforeEach(() => {
  start.mockReset();
});
it("submits only the selected plan and venue while explaining no real payment", async () => {
  start.mockResolvedValue({
    ok: false,
    error: { code: "VENUE_BILLING_PENDING", message: "We are confirming your demo subscription." },
  });
  render(<VenuePlanPicker venueId="venue" pendingCheckout={false} />);
  expect(screen.getByText(/No real money will be charged/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /annual/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() => expect(start).toHaveBeenCalledWith({ venueId: "venue", plan: "yearly" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/confirming/i);
});
it("pending retry explains that the existing selection is retained", () => {
  render(<VenuePlanPicker venueId="venue" pendingCheckout />);
  expect(screen.getByText(/existing plan/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /check checkout/i })).toBeInTheDocument();
});
