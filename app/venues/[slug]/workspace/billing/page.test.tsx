// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { activeVenueBilling, expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Page from "./page";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/features/venue-billing/queries", () => ({ getVenueBillingWorkspace: query }));
vi.mock("@/features/venue-billing/actions", () => ({
  startVenueCheckoutAction: vi.fn(),
  openVenueBillingPortalAction: vi.fn(),
}));
it("admin sees private status without a checkout control", async () => {
  query.mockResolvedValue({
    venueId: "venue",
    slug: "test",
    name: "Test venue",
    context: {
      ...activeVenueBilling,
      canManageBilling: false,
      canStartCheckout: false,
      canOpenPortal: false,
    },
  });
  render(await Page({ params: Promise.resolve({ slug: "test" }) }));
  expect(screen.getByText(/only the venue owner/i)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("exact owner can select a demo plan", async () => {
  query.mockResolvedValue({
    venueId: "venue",
    slug: "test",
    name: "Test venue",
    context: { ...expiredVenueBilling, canStartCheckout: true, canOpenPortal: false },
  });
  render(await Page({ params: Promise.resolve({ slug: "test" }) }));
  expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
});
