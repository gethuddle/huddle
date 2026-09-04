// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), portal: vi.fn(), notFound: vi.fn() }));
vi.mock("@/features/venue-billing/queries", () => ({
  getArchivedVenueBillingContext: mocks.query,
}));
vi.mock("@/features/venue-billing/actions", () => ({
  openArchivedVenueBillingPortalAction: mocks.portal,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import Page from "./page";
const archived = {
  venueId: "00000000-0000-4000-8000-000000000010",
  name: "Closed venue",
  slug: "closed-venue",
  state: "expired",
  interval: "month",
  paidThroughAt: null,
  canOpenPortal: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue(archived);
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  mocks.portal.mockResolvedValue({ ok: false, error: { message: "Please try again." } });
});
it("provides only archived recovery with an actionable portal failure", async () => {
  const user = userEvent.setup();
  render(await Page({ params: Promise.resolve({ slug: "closed-venue" }) }));
  expect(screen.getByRole("heading", { name: "Billing for a closed venue" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /checkout|monthly|annual/i }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open billing portal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
  expect(mocks.portal).toHaveBeenCalledWith({ slug: "closed-venue" });
});
it("does not offer portal or checkout without a current subscription", async () => {
  mocks.query.mockResolvedValue({ ...archived, canOpenPortal: false });
  render(await Page({ params: Promise.resolve({ slug: "closed-venue" }) }));
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("returns ordinary not-found for an admin or unrelated account", async () => {
  mocks.query.mockRejectedValue(new Error("NOT_FOUND"));
  await expect(Page({ params: Promise.resolve({ slug: "closed-venue" }) })).rejects.toThrow(
    "NEXT_NOT_FOUND",
  );
});
