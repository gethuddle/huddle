// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyHuddleOverview: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/features/dashboard/queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/dashboard/queries")>();
  return { ...original, getMyHuddleOverview: mocks.getMyHuddleOverview };
});

import DashboardPage from "./page";
import { DomainError } from "@/lib/errors";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.getMyHuddleOverview.mockResolvedValue({
      events: [],
      groups: [],
      saved: [],
      pages: { events: 1, groups: 1, saved: 1 },
    });
  });

  it("defaults to active current-state collections and keeps History opt-in", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.getMyHuddleOverview).toHaveBeenCalledWith({
      eventBucket: "upcoming",
      eventPage: 1,
      groupBucket: "owner",
      groupPage: 1,
      savedBucket: "all",
      savedPage: 1,
    });
    expect(screen.getByRole("combobox", { name: "Show events" })).toHaveValue("upcoming");
    expect(screen.getByText(/Completed and cancelled events stay out of sight/i)).toBeVisible();
  });

  it("uses bounded validated filters instead of treating them as route navigation", async () => {
    mocks.getMyHuddleOverview.mockResolvedValue({
      events: [],
      groups: [],
      saved: [],
      pages: { events: 3, groups: 2, saved: 4 },
    });
    render(
      await DashboardPage({
        searchParams: Promise.resolve({
          eventBucket: "history",
          eventsPage: "3",
          groupBucket: "owner",
          groupsPage: "2",
          savedBucket: "venue",
          savedPage: "4",
        }),
      }),
    );

    expect(mocks.getMyHuddleOverview).toHaveBeenCalledWith({
      eventBucket: "history",
      eventPage: 3,
      groupBucket: "owner",
      groupPage: 2,
      savedBucket: "venue",
      savedPage: 4,
    });
  });

  it("redirects an above-window page to page 501 while preserving every filter", async () => {
    mocks.getMyHuddleOverview.mockResolvedValue({
      events: [],
      groups: [],
      saved: [],
      pages: { events: 501, groups: 2, saved: 4 },
    });

    await expect(
      DashboardPage({
        searchParams: Promise.resolve({
          eventBucket: "history",
          eventsPage: "502",
          groupBucket: "admin",
          groupsPage: "2",
          savedBucket: "venue",
          savedPage: "4",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.getMyHuddleOverview).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/dashboard?eventBucket=history&eventsPage=501&groupBucket=admin&groupsPage=2&savedBucket=venue&savedPage=4#your-events-heading",
    );
  });

  it("redirects an empty high collection page while preserving every active filter", async () => {
    mocks.getMyHuddleOverview.mockResolvedValue({
      events: [],
      groups: [],
      saved: [],
      pages: { events: 2, groups: 3, saved: 5 },
    });

    await expect(
      DashboardPage({
        searchParams: Promise.resolve({
          eventBucket: "history",
          eventsPage: "4",
          groupBucket: "admin",
          groupsPage: "3",
          savedBucket: "venue",
          savedPage: "5",
          ignored: "do-not-preserve",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/dashboard?eventBucket=history&eventsPage=2&groupBucket=admin&groupsPage=3&savedBucket=venue&savedPage=5#your-events-heading",
    );
  });

  it.each([
    ["EMAIL_NOT_VERIFIED", "/auth/verify", "Review verification"],
    ["PROFILE_INCOMPLETE", "/onboarding/fan", "Enable Fan workspace"],
    ["RULES_ACCEPTANCE_REQUIRED", "/onboarding", "Continue setup"],
    ["ACCOUNT_SUSPENDED", "/account", "Open account"],
    ["ACCOUNT_RESTRICTED", "/account", "Open account"],
  ] as const)("maps %s to the truthful Fan recovery surface", async (code, href, label) => {
    mocks.getMyHuddleOverview.mockRejectedValue(new DomainError(code));

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });
});
