// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), redirect: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.actor }));
vi.mock("@/features/events/drafts", () => ({ listMyEventDrafts: mocks.list }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));
import DraftsPage from "./page";
const id = "60000000-0000-4000-8000-000000000111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ supabase: {} });
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  mocks.list.mockResolvedValue({
    items: [
      {
        id,
        title: "Saved watch",
        step: 2,
        homeTeamName: "Home",
        awayTeamName: "Away",
        startsAt: null,
        savedAt: "2026-09-04T10:00:00Z",
      },
    ],
    page: 1,
    pageCount: 2,
    totalCount: 21,
    hasMoreBeyondWindow: false,
  });
});
it("lists owner summaries with visible resume and paging controls", async () => {
  render(await DraftsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.actor).toHaveBeenCalledWith("authenticated");
  expect(screen.getByRole("link", { name: "Resume draft" })).toHaveAttribute(
    "href",
    `/events/new?draft=${id}`,
  );
  expect(screen.getByLabelText("Go to next page")).toHaveAttribute("href", "/events/drafts?page=2");
});
it("requires authentication before reading draft summaries", async () => {
  mocks.actor.mockRejectedValue(new DomainError("AUTH_REQUIRED"));
  render(await DraftsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/auth/sign-in?next=%2Fevents%2Fdrafts",
  );
  expect(mocks.list).not.toHaveBeenCalled();
});
it("canonicalizes a removed last page back to the available draft page", async () => {
  await expect(DraftsPage({ searchParams: Promise.resolve({ page: "2" }) })).rejects.toThrow(
    "NEXT_REDIRECT",
  );
  expect(mocks.redirect).toHaveBeenCalledWith("/events/drafts?page=1");
});
