// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Page from "./page";
const mocks = vi.hoisted(() => ({ query: vi.fn(), settings: vi.fn(), summary: vi.fn() }));
const query = mocks.query;
vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.query,
  getAuthorizedVenueWorkspaceSummaryBySlug: mocks.summary,
}));
vi.mock("@/features/venues/workspace/queries", () => ({
  listVenueCalendar: async () => [],
  getVenueToday: async () => ({ nextEvent: null, todayEvents: [], attention: [], setupTasks: [] }),
  getVenueSettings: mocks.settings,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.summary.mockResolvedValue({
    id: "venue",
    slug: "corner",
    name: "Corner",
    role: "owner",
    kind: "venue",
  });
  mocks.settings.mockResolvedValue({
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
  });
});
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
  expect(screen.getByRole("button", { name: "Save venue" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Add viewing area" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "View public page" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /archive|close venue/i })).toBeEnabled();
});

it("keeps a mid-request membership loss non-disclosing even if the parallel settings read fails", async () => {
  query.mockResolvedValue(null);
  mocks.settings.mockRejectedValue(new Error("database membership denied"));

  await expect(Page({ params: Promise.resolve({ slug: "corner" }) })).rejects.toThrow("not found");
  expect(mocks.settings).toHaveBeenCalledWith("venue");
});
