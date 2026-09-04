// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { expiredVenueBilling } from "@/tests/fixtures/venue-billing";
import Page from "./page";
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  workspaceSummary: vi.fn(),
  history: vi.fn(),
  redirect: vi.fn(),
}));
const query = mocks.workspace;
const historyItem = {
  id: "e2000000-0000-4000-8000-000000000101",
  title: "Completed derby",
  status: "completed" as const,
  startsAt: "2026-08-01T17:00:00Z",
  endsAt: "2026-08-01T20:00:00Z",
  venueSpace: null,
  attendanceMode: "reservations" as const,
  capacity: 40,
  approvedAttendeeCount: 12,
  requiresApproval: false,
};
vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.workspace,
  getAuthorizedVenueWorkspaceSummaryBySlug: mocks.workspaceSummary,
}));
vi.mock("@/features/venues/workspace/queries", () => ({
  listVenueCalendar: async () => [],
  listVenueCalendarPage: mocks.history,
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
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));
const redirectSentinel = new Error("NEXT_REDIRECT");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspaceSummary.mockResolvedValue({
    id: "venue",
    slug: "corner",
    name: "Corner",
    role: "owner",
    kind: "venue",
  });
  mocks.redirect.mockImplementation(() => {
    throw redirectSentinel;
  });
});
it("starts the protected history read before the detailed workspace projection finishes", async () => {
  const detailed = Promise.withResolvers<{
    id: string;
    slug: string;
    name: string;
    role: "owner";
    verificationStatus: "unverified";
    billing: typeof expiredVenueBilling;
  }>();
  mocks.workspace.mockReturnValue(detailed.promise);
  mocks.history.mockResolvedValue({ items: [], page: 1, totalCount: 0 });

  const pending = Page({
    params: Promise.resolve({ slug: "corner" }),
    searchParams: Promise.resolve({}),
  });
  await vi.waitFor(() => expect(mocks.history).toHaveBeenCalledWith("venue", "all", 1));
  detailed.resolve({
    id: "venue",
    slug: "corner",
    name: "Corner",
    role: "owner",
    verificationStatus: "unverified",
    billing: expiredVenueBilling,
  });

  await expect(pending).resolves.toBeDefined();
});
it("keeps expired information accessible and forwards safe restrictions", async () => {
  mocks.history.mockResolvedValue({ items: [], page: 1, totalCount: 0 });
  query.mockResolvedValue({
    id: "venue",
    slug: "corner",
    name: "Corner",
    role: "owner",
    verificationStatus: "unverified",
    billing: expiredVenueBilling,
  });
  render(
    await Page({ params: Promise.resolve({ slug: "corner" }), searchParams: Promise.resolve({}) }),
  );
  expect(screen.getByRole("heading", { name: "Your calendar is clear" })).toBeVisible();
  expect(screen.getByText(/History remains available/)).toBeVisible();
});

it("requests later server-filtered Calendar pages", async () => {
  mocks.history.mockResolvedValue({ items: [historyItem], page: 13, totalCount: 251 });
  query.mockResolvedValue({
    id: "venue",
    slug: "corner",
    role: "owner",
    verificationStatus: "unverified",
    billing: expiredVenueBilling,
  });
  render(
    await Page({
      params: Promise.resolve({ slug: "corner" }),
      searchParams: Promise.resolve({ status: "completed", page: "13" }),
    }),
  );
  expect(mocks.history).toHaveBeenCalledWith("venue", "completed", 13);
  expect(screen.getByRole("link", { name: /Completed derby/ })).toBeVisible();
  expect(screen.getByText("251 events in the Completed view.")).toBeVisible();
  expect(screen.getByText("Page 13 of 13")).toBeVisible();
});

it("canonicalizes Calendar pages above the bounded database window before reading history", async () => {
  query.mockResolvedValue({
    id: "venue",
    slug: "corner",
    role: "owner",
    verificationStatus: "unverified",
    billing: expiredVenueBilling,
  });

  await expect(
    Page({
      params: Promise.resolve({ slug: "corner" }),
      searchParams: Promise.resolve({ status: "completed", page: "999999999999999999" }),
    }),
  ).rejects.toBe(redirectSentinel);

  expect(mocks.redirect).toHaveBeenCalledWith(
    "/venues/corner/workspace/calendar?status=completed&page=501#venue-calendar",
  );
  expect(mocks.history).not.toHaveBeenCalled();
});

it("redirects an empty stale Calendar page to the filtered final page", async () => {
  query.mockResolvedValue({
    id: "venue",
    slug: "corner",
    role: "owner",
    verificationStatus: "unverified",
    billing: expiredVenueBilling,
  });
  mocks.history.mockImplementation(async (_venueId: string, _status: string, page: number) =>
    page === 13
      ? { items: [], page: 13, totalCount: 0 }
      : { items: [historyItem], page: 1, totalCount: 21 },
  );

  await expect(
    Page({
      params: Promise.resolve({ slug: "corner" }),
      searchParams: Promise.resolve({ status: "completed", page: "13" }),
    }),
  ).rejects.toBe(redirectSentinel);

  expect(mocks.history).toHaveBeenNthCalledWith(1, "venue", "completed", 13);
  expect(mocks.history).toHaveBeenNthCalledWith(2, "venue", "completed", 1);
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/venues/corner/workspace/calendar?status=completed&page=2#venue-calendar",
  );
});
