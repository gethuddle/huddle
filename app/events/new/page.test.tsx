// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { DomainError } from "@/lib/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedVenueWorkspaceBySlug: vi.fn(),
  getVenueCreationViewerState: vi.fn(),
  catalog: vi.fn(),
  draft: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/features/venues/viewer", () => ({
  getVenueCreationViewerState: mocks.getVenueCreationViewerState,
}));
vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.getAuthorizedVenueWorkspaceBySlug,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/features/events/catalog", () => ({ getPrivateEventCatalog: mocks.catalog }));
vi.mock("@/features/auth/actor", () => ({ requireActor: async () => ({ supabase: {} }) }));
vi.mock("@/features/events/drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("@/features/events/components/event-create-flow", () => ({
  EventCreateFlow: () => <div>Event wizard</div>,
}));

import NewEventPage from "./page";

describe("legacy Venue event entry", () => {
  it.each(["complete-profile", "not-permitted"])(
    "keeps authenticated draft recovery reachable when hosting is %s",
    async (state) => {
      mocks.getVenueCreationViewerState.mockResolvedValue(state);
      render(await NewEventPage({ searchParams: Promise.resolve({}) }));
      expect(screen.getByRole("link", { name: "Saved drafts" })).toHaveAttribute(
        "href",
        "/events/drafts",
      );
      expect(mocks.catalog).not.toHaveBeenCalled();
    },
  );
  it("does not render a guessed private draft that the owner-bound read denies", async () => {
    mocks.draft.mockRejectedValue(new DomainError("NOT_FOUND"));
    await expect(
      NewEventPage({
        searchParams: Promise.resolve({ draft: "60000000-0000-4000-8000-000000000111" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("keeps saved draft recovery reachable even if no future fixtures remain", async () => {
    mocks.catalog.mockResolvedValue({ matches: [], groups: [], acceptedFriendCount: 0 });
    render(await NewEventPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Saved drafts" })).toHaveAttribute(
      "href",
      "/events/drafts",
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVenueCreationViewerState.mockResolvedValue("allowed");
  });

  it("reauthorizes the Venue workspace and keeps a valid optional fixture preselection", async () => {
    const matchId = "e7000000-0000-4000-8000-000000000101";
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue({ slug: "match-corner" });

    await expect(
      NewEventPage({
        searchParams: Promise.resolve({ venue: "match-corner", matchId }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.getAuthorizedVenueWorkspaceBySlug).toHaveBeenCalledWith("match-corner");
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/venues/match-corner/workspace/plan?matchId=${matchId}`,
    );
  });

  it("does not redirect a guessed Venue slug without active membership", async () => {
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue(null);

    await expect(
      NewEventPage({ searchParams: Promise.resolve({ venue: "match-corner" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
