// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Page from "./page";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/features/workspaces/queries", () => ({ getAuthorizedVenueWorkspaceBySlug: query }));
vi.mock("@/features/venues/workspace/queries", () => ({
  listVenueCalendar: async () => [],
  getVenueToday: async () => ({ nextEvent: null, todayEvents: [], attention: [], setupTasks: [] }),
  getVenueSettings: async () => ({
    id: "venue",
    slug: "corner",
    name: "Corner",
    addressText: "1 Main Street",
    description: "Watch with friends.",
    facilities: [],
    houseInformation: "",
    defaultAttendanceMode: "open_door",
    defaultRequiresApproval: false,
    spaces: [{ id: "area", name: "Main screen", capacity: 80, active: true }],
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
it("keeps expired information accessible and forwards safe restrictions", async () => {
  query.mockResolvedValue({
    id: "venue",
    slug: "corner",
    name: "Corner",
    role: "owner",
    verificationStatus: "unverified",
    billing: expiredVenueBilling,
  });
  render(await Page({ params: Promise.resolve({ slug: "corner" }) }));
  expect(screen.queryByRole("link", { name: "Plan events" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "No venue events yet" })).toBeVisible();
});
