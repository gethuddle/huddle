// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPeopleHub: vi.fn(),
  redirect: vi.fn(),
  requireActor: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/people/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/people/search")>();
  return { ...original, listPeopleHub: mocks.listPeopleHub };
});

import PeoplePage from "./page";
import { DomainError } from "@/lib/errors";

const emptyPage = { items: [], page: 1, pageCount: 1, totalCount: 0 };

describe("PeoplePage", () => {
  it("retains a valid draft return during canonical search-page correction", async () => {
    const returnTo = "/events/new?draft=60000000-0000-4000-8000-000000000111";
    await expect(
      PeoplePage({ searchParams: Promise.resolve({ q: "hello", searchPage: "502", returnTo }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`returnTo=${encodeURIComponent(returnTo)}`),
    );
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/events/new?draft=invalid",
    "/events/new?draft=60000000-0000-4000-8000-000000000111&next=https://evil.example",
    "/events/new?draft=60000000-0000-4000-8000-000000000111#evil",
    "/events/new?draft=60000000-0000-4000-8000-000000000111&draft=60000000-0000-4000-8000-000000000222",
  ])("rejects unsafe or non-draft return %s", async (returnTo) => {
    render(await PeoplePage({ searchParams: Promise.resolve({ returnTo }) }));
    expect(screen.queryByRole("link", { name: "Return to event draft" })).not.toBeInTheDocument();
  });
  it("retains the private draft return through search, clearing and paging", async () => {
    const returnTo = "/events/new?draft=60000000-0000-4000-8000-000000000111";
    mocks.listPeopleHub.mockResolvedValue({ ...emptyPage, totalCount: 21, pageCount: 2 });
    const { container } = render(
      await PeoplePage({ searchParams: Promise.resolve({ q: "hello", returnTo }) }),
    );
    expect(screen.getByRole("link", { name: "Return to event draft" })).toHaveAttribute(
      "href",
      returnTo,
    );
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(returnTo);
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      `/people?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute(
      "href",
      expect.stringContaining(`returnTo=${encodeURIComponent(returnTo)}`),
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.requireActor.mockResolvedValue({});
    mocks.listPeopleHub.mockResolvedValue(emptyPage);
  });

  it("keeps discovery and relationship states on one understandable page", async () => {
    render(await PeoplePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "People" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Suggested for you" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Friends" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Requests to review" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Requests you sent" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Friend requests/ })).not.toBeInTheDocument();
    expect(mocks.listPeopleHub).toHaveBeenCalledWith("suggested", "", 1);
    expect(mocks.listPeopleHub).toHaveBeenCalledWith("accepted", "", 1);
    expect(mocks.listPeopleHub).toHaveBeenCalledWith("incoming", "", 1);
    expect(mocks.listPeopleHub).toHaveBeenCalledWith("sent", "", 1);
  });

  it("puts incoming requests first when an attention link targets that decision surface", async () => {
    render(await PeoplePage({ searchParams: Promise.resolve({ bucket: "incoming" }) }));

    const incoming = screen.getByRole("heading", { name: "Requests to review" });
    const suggested = screen.getByRole("heading", { name: "Suggested for you" });
    expect(incoming.compareDocumentPosition(suggested) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  });

  it("uses search as the sole paginated result collection on the same route", async () => {
    const searchPage = {
      items: [
        {
          id: "c5000000-0000-4000-8000-000000000104",
          handle: "state_team",
          displayName: "Team Person",
          reason: null,
          friendship: null,
        },
      ],
      page: 1,
      pageCount: 1,
      totalCount: 1,
    };
    mocks.listPeopleHub.mockImplementation(async (bucket: string) =>
      bucket === "search" ? searchPage : emptyPage,
    );

    render(
      await PeoplePage({
        searchParams: Promise.resolve({ q: "Team Person", searchPage: "1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Search results" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Team Person" })).toHaveAttribute(
      "href",
      "/people/state_team",
    );
    expect(mocks.listPeopleHub).toHaveBeenCalledWith("search", "Team Person", 1);
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/people");
    expect(screen.queryByRole("heading", { name: "Suggested for you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Friends" })).not.toBeInTheDocument();
    expect(mocks.listPeopleHub).toHaveBeenCalledTimes(1);
  });

  it("renders one current friendship control when search and relationship buckets overlap", async () => {
    const overlappingPerson = {
      id: "c5000000-0000-4000-8000-000000000104",
      handle: "state_team",
      displayName: "Team Person",
      reason: null,
      friendship: {
        id: "c5000000-0000-4000-8000-000000000601",
        status: "pending" as const,
        direction: "incoming" as const,
      },
    };
    mocks.listPeopleHub.mockImplementation(async (bucket: string) => {
      if (bucket !== "search")
        throw new Error("relationship buckets must not paginate in search mode");
      return {
        items: Array.from({ length: 20 }, (_, index) => ({
          ...overlappingPerson,
          id: `c5000000-0000-4000-8000-${String(index + 104).padStart(12, "0")}`,
          handle: index === 0 ? "state_team" : `state_team_${index}`,
          displayName: index === 0 ? "Team Person" : `Team Person ${index}`,
        })),
        page: 1,
        pageCount: 2,
        totalCount: 21,
      };
    });

    render(await PeoplePage({ searchParams: Promise.resolve({ q: "Team Person" }) }));

    expect(screen.getAllByRole("link", { name: "Team Person" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(20);
    expect(screen.getAllByRole("button", { name: "Decline" })).toHaveLength(20);
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
    expect(mocks.listPeopleHub).toHaveBeenCalledTimes(1);
  });

  it("redirects an above-window search page to 501 while preserving its query", async () => {
    mocks.listPeopleHub.mockResolvedValue({ ...emptyPage, page: 501, pageCount: 501 });

    await expect(
      PeoplePage({
        searchParams: Promise.resolve({ q: "Team Person", searchPage: "502" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.listPeopleHub).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/people?q=Team+Person&searchPage=501#people-search",
    );
  });

  it("redirects an empty high relationship page while preserving supported relationship state", async () => {
    mocks.listPeopleHub.mockImplementation(
      async (bucket: string, _query: string, page: number) => ({
        ...emptyPage,
        page: bucket === "incoming" ? 2 : page,
        pageCount: bucket === "incoming" ? 2 : Math.max(page, 1),
      }),
    );

    await expect(
      PeoplePage({
        searchParams: Promise.resolve({
          suggestedPage: "3",
          friendsPage: "2",
          incomingPage: "4",
          sentPage: "5",
          ignored: "do-not-preserve",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/people?suggestedPage=3&friendsPage=2&incomingPage=2&sentPage=5#people-incoming",
    );
  });

  it.each([
    ["EMAIL_NOT_VERIFIED", "/auth/verify", "Review verification"],
    ["PROFILE_INCOMPLETE", "/onboarding/fan", "Enable Fan workspace"],
    ["ADULT_ATTESTATION_REQUIRED", "/onboarding", "Continue setup"],
    ["ACCOUNT_SUSPENDED", "/account", "Open account"],
    ["ACCOUNT_RESTRICTED", "/account", "Open account"],
  ] as const)("maps %s to the truthful People recovery surface", async (code, href, label) => {
    mocks.requireActor.mockRejectedValue(new DomainError(code));

    render(await PeoplePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });
});
