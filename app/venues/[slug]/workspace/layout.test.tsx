// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { activeVenueBilling, expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Layout from "./layout";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/features/workspaces/queries", () => ({ getAuthorizedVenueWorkspaceBySlug: query }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/venues/corner/workspace",
  notFound: () => {
    throw new Error("not found");
  },
}));
it.each(["owner", "admin"])(
  "retains a private %s workspace and replaces public-page navigation",
  async (role) => {
    query.mockResolvedValue({
      id: "venue",
      slug: "corner",
      name: "Corner",
      role,
      billing: expiredVenueBilling,
    });
    render(
      await Layout({
        params: Promise.resolve({ slug: "corner" }),
        children: <p>History retained</p>,
      }),
    );
    expect(screen.getByText("History retained")).toBeVisible();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "View public page" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      "/venues/corner/workspace/billing",
    );
  },
);
it("retains the active public link without a global warning", async () => {
  query.mockResolvedValue({ slug: "corner", name: "Corner", billing: activeVenueBilling });
  render(await Layout({ params: Promise.resolve({ slug: "corner" }), children: <p>Today</p> }));
  expect(screen.getByRole("link", { name: "View public page" })).toHaveAttribute(
    "href",
    "/venues/corner",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
