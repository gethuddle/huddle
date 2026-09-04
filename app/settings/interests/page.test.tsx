// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InterestSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  getInterestCatalog: vi.fn(),
  getInterestViewer: vi.fn(),
}));

vi.mock("@/features/subscriptions/catalog", () => ({
  getInterestCatalog: mocks.getInterestCatalog,
}));
vi.mock("@/features/subscriptions/viewer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/subscriptions/viewer")>();
  return { ...actual, getInterestViewer: mocks.getInterestViewer };
});
vi.mock("@/features/subscriptions/components/follow-control", () => ({
  FollowControl: ({ targetName }: Readonly<{ targetName: string }>) => (
    <button type="button">Follow {targetName}</button>
  ),
}));

describe("InterestSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInterestViewer.mockResolvedValue({
      state: "eligible",
      followedKeys: ["team:10000000-0000-4000-8000-000000000004"],
    });
    mocks.getInterestCatalog.mockResolvedValue({
      sports: [{ id: "10000000-0000-4000-8000-000000000001", name: "Football", slug: "football" }],
      competitions: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "Premier League",
          code: "PL",
          sportId: "10000000-0000-4000-8000-000000000001",
        },
      ],
      teams: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          name: "Arsenal FC",
          shortName: "Arsenal",
          tla: "ARS",
          sportId: "10000000-0000-4000-8000-000000000001",
        },
        {
          id: "10000000-0000-4000-8000-000000000005",
          name: "Chelsea FC",
          shortName: "Chelsea",
          tla: "CHE",
          sportId: "10000000-0000-4000-8000-000000000001",
        },
      ],
    });
  });

  it("offers searchable Popular and Suggested sections without implementation copy", async () => {
    render(await InterestSettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("searchbox", { name: "Search interests" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Followed only" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Popular" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Suggested teams" })).toBeVisible();
    expect(screen.queryByText(/provider|catalog|submitted MVP/i)).not.toBeInTheDocument();
  });

  it("filters by search text and the viewer's followed set", async () => {
    const { rerender } = render(
      await InterestSettingsPage({ searchParams: Promise.resolve({ q: "arsenal" }) }),
    );

    expect(screen.getByText("Arsenal")).toBeVisible();
    expect(screen.queryByText("Chelsea")).not.toBeInTheDocument();

    rerender(await InterestSettingsPage({ searchParams: Promise.resolve({ followed: "on" }) }));
    expect(screen.getByRole("heading", { name: "Followed" })).toBeVisible();
    expect(screen.getByText("Arsenal")).toBeVisible();
    expect(screen.queryByText("Football")).not.toBeInTheDocument();
    expect(screen.queryByText("Chelsea")).not.toBeInTheDocument();
  });

  it("passes a bounded team search to the catalog instead of filtering only the first browse page", async () => {
    render(await InterestSettingsPage({ searchParams: Promise.resolve({ q: "late horizon" }) }));

    expect(mocks.getInterestCatalog).toHaveBeenCalledWith("late horizon");
  });
});
