// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Page from "./page";
import { DomainError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), result: vi.fn() }));
vi.mock("@/features/venue-billing/queries", () => ({
  getVenueBillingWorkspace: mocks.workspace,
  getVenueCheckoutReturn: mocks.result,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("not found");
  },
}));
it.each(["active", "failed", "confirming"])(
  "renders private %s without exposing checkout identifiers",
  async (status) => {
    mocks.workspace.mockResolvedValue({ venueId: "venue", slug: "test", name: "Test" });
    mocks.result.mockResolvedValue(status);
    render(
      await Page({
        params: Promise.resolve({ slug: "test" }),
        searchParams: Promise.resolve({ checkout_id: "00000000-0000-4000-8000-000000000010" }),
      }),
    );
    expect(screen.getByRole("heading")).toHaveTextContent(
      status === "active"
        ? "Your venue is ready."
        : status === "failed"
          ? "Checkout was not completed."
          : "Confirming your demo subscription",
    );
    expect(document.body.textContent).not.toContain("00000000-");
    expect(screen.getByText(/Polar Sandbox/)).toHaveTextContent("No real money will be charged");
  },
);

it("a temporary confirmation read failure does not claim checkout failed", async () => {
  mocks.workspace.mockResolvedValue({ venueId: "venue", slug: "test", name: "Test" });
  mocks.result.mockRejectedValue(new DomainError("UPSTREAM_UNAVAILABLE"));
  render(
    await Page({
      params: Promise.resolve({ slug: "test" }),
      searchParams: Promise.resolve({ checkout_id: "00000000-0000-4000-8000-000000000010" }),
    }),
  );
  expect(screen.getByRole("heading")).toHaveTextContent("Confirming your demo subscription");
  expect(screen.queryByText("Checkout was not completed.")).not.toBeInTheDocument();
});
