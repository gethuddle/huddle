// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { activeVenueBilling, expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Page from "./page";
import Layout from "../layout";
const query = vi.hoisted(() => vi.fn());
const workspaceQuery = vi.hoisted(() => vi.fn());
vi.mock("@/features/venue-billing/queries", () => ({ getVenueBillingWorkspace: query }));
vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: workspaceQuery,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/venues/test/workspace/billing",
}));
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

it.each([true, false])(
  "billing layout explains private state without self-navigation (owner=%s)",
  async (isOwner) => {
    const context = {
      ...expiredVenueBilling,
      state: "payment_required" as const,
      canManageBilling: isOwner,
      canStartCheckout: isOwner,
      canOpenPortal: false,
    };
    query.mockResolvedValue({ venueId: "venue", slug: "test", name: "Test venue", context });
    workspaceQuery.mockResolvedValue({
      id: "venue",
      slug: "test",
      name: "Test venue",
      billing: context,
    });

    render(
      await Layout({
        params: Promise.resolve({ slug: "test" }),
        children: await Page({ params: Promise.resolve({ slug: "test" }) }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Your venue is private.");
    expect(screen.queryByRole("link", { name: "Open Billing" })).not.toBeInTheDocument();
    if (isOwner) expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    else {
      expect(screen.getByText(/only the venue owner/i)).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    }
  },
);
