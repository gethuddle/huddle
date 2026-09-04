// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Page from "./page";
const mocks = vi.hoisted(() => ({
  authorizedSummary: vi.fn(),
  getVenueToday: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.workspace,
  getAuthorizedVenueWorkspaceSummaryBySlug: mocks.authorizedSummary,
}));
vi.mock("@/features/venues/workspace/queries", () => ({
  listVenueCalendar: async () => [],
  getVenueToday: mocks.getVenueToday,
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

const venueId = "e4000000-0000-4000-8000-000000000102";
const summary = {
  kind: "venue",
  id: venueId,
  slug: "corner",
  label: "Corner",
  role: "owner",
} as const;
const workspace = {
  id: venueId,
  slug: "corner",
  name: "Corner",
  role: "owner",
  verificationStatus: "unverified",
  needsAreaSetup: false,
  spaces: [],
  billing: expiredVenueBilling,
} as const;
const today = { nextEvent: null, todayEvents: [], attention: [], setupTasks: [] } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizedSummary.mockResolvedValue(summary);
  mocks.workspace.mockResolvedValue(workspace);
  mocks.getVenueToday.mockResolvedValue(today);
});

it("keeps expired information accessible and forwards safe restrictions", async () => {
  render(await Page({ params: Promise.resolve({ slug: "corner" }) }));
  expect(screen.queryByRole("link", { name: "Plan events" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open Billing" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "View public page" })).not.toBeInTheDocument();
});

it("starts the protected Today read before the detailed venue and billing projection resolves", async () => {
  let resolveWorkspace: (value: typeof workspace) => void = () => undefined;
  mocks.workspace.mockReturnValue(
    new Promise((resolve) => {
      resolveWorkspace = resolve;
    }),
  );

  const page = Page({ params: Promise.resolve({ slug: "corner" }) });
  await Promise.resolve();
  await Promise.resolve();

  expect(mocks.authorizedSummary).toHaveBeenCalledWith("corner");
  expect(mocks.getVenueToday).toHaveBeenCalledWith(venueId);

  resolveWorkspace(workspace);
  render(await page);
  expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
});
