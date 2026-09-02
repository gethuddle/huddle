// @vitest-environment jsdom

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistedDiscoveryChat } from "./assisted-discovery-chat";

vi.mock("@/features/locations/components/address-search", () => ({
  AddressSearch: ({ onConfirm }: { onConfirm: (value: unknown) => void }) => (
    <button
      onClick={() => onConfirm({ latitude: 32.81, longitude: 34.99, label: "Haifa test address" })}
      type="button"
    >
      Use test address
    </button>
  ),
}));

const resultCard = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "North London watch",
  host: {
    kind: "venue",
    displayName: "The Corner",
    venueSlug: "the-corner",
    verificationStatus: "unverified",
  },
  match: {
    id: "22222222-2222-4222-8222-222222222222",
    competitionName: "Premier League",
    homeTeamName: "Arsenal FC",
    homeTeamTla: "ARS",
    homeTeamCrestUrl: "https://crests.football-data.org/57.png",
    awayTeamName: "Chelsea FC",
    awayTeamTla: "CHE",
    awayTeamCrestUrl: "https://crests.football-data.org/61.png",
  },
  group: {
    name: "North London Supporters",
    slug: "north-london-supporters",
    relationship: "organizer",
  },
  startsAt: "2026-09-02T17:00:00Z",
  endsAt: "2026-09-02T20:00:00Z",
  placeKind: "venue",
  locationSummary: "1–5 km away",
  audience: "public",
  attendanceMode: "reservations",
  capacity: 40,
  approvedAttendeeCount: 4,
  remainingCapacity: 36,
  requiresApproval: false,
  viewerParticipationState: "approved",
  venueFacilities: ["food"],
  matchedReasons: ["Hosted by a friend.", "Venue lists food."],
};

function apiResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function submit(query: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Ask Huddle what you want to watch");
  await user.clear(input);
  await user.type(input, query);
  await user.click(screen.getByRole("button", { name: "Send question" }));
  return user;
}

describe("AssistedDiscoveryChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("starts as a full-screen shadcn conversation with no retained exchange", () => {
    const first = render(<AssistedDiscoveryChat />);

    const conversation = screen.getByRole("region", { name: "Ask Huddle conversation" });
    expect(conversation).toHaveAttribute("data-layout", "immersive");
    expect(conversation).not.toHaveClass("rounded-3xl", "border", "shadow-sm");
    expect(screen.getByRole("heading", { name: "Ask Huddle" })).toHaveClass("sr-only");
    expect(conversation.querySelector("header")).toBeNull();
    expect(screen.getByText("What kind of huddle are you after?")).toBeVisible();
    const resetButton = screen.getByRole("button", { name: "Start a new search" });
    expect(resetButton).toBeDisabled();
    expect(resetButton).toHaveClass("size-11");
    expect(resetButton.closest('[data-slot="input-group"]')).not.toBeNull();
    expect(screen.getByRole("form", { name: "Ask Huddle question" })).toBeVisible();
    const composer = document.querySelector('[data-slot="chat-composer"]');
    expect(composer).not.toHaveClass("border-t", "bg-gradient-to-t");
    expect(composer?.querySelector('[data-slot="input-group"]')).toHaveClass(
      "rounded-[1.5rem]",
      "border-foreground/25",
      "shadow-none",
    );
    expect(
      composer?.querySelector('[data-slot="input-group-addon"][data-align="block-end"]'),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send question" })).toHaveClass("size-11");
    expect(screen.getByLabelText("Ask Huddle what you want to watch")).toHaveClass(
      "placeholder:text-muted-foreground",
    );
    expect(document.querySelector('[data-slot="message-scroller"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="message-scroller-viewport"]')).toHaveClass(
      "scroll-fade-b",
      "contain-content",
    );
    expect(document.querySelector('[data-slot="message"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="bubble"]')).toHaveAttribute("data-variant", "ghost");
    expect(screen.queryByRole("list", { name: "Matching huddles" })).not.toBeInTheDocument();

    first.unmount();
    render(<AssistedDiscoveryChat />);
    expect(screen.queryByText("North London watch")).not.toBeInTheDocument();
  });

  it("shows one user question and a full-detail response with crests and group context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · Arsenal FC · venue lists food",
          locationLabel: "Jerusalem, Israel",
          results: [resultCard],
        }),
      ),
    );
    render(<AssistedDiscoveryChat />);

    const query = "Anything in Jerusalem on 2 September?";
    await submit(query);

    const question = await screen.findByText(query);
    expect(question.closest('[data-slot="bubble"]')).toHaveAttribute("data-variant", "muted");
    expect(question.closest('[data-slot="message-scroller-item"]')).toHaveAttribute(
      "data-scroll-anchor",
      "true",
    );
    const resultHeading = await screen.findByRole("heading", { name: "North London watch" });
    expect(resultHeading.closest('[data-slot="bubble"]')).toHaveAttribute("data-variant", "ghost");
    expect(resultHeading.closest('[data-slot="message-scroller-item"]')).toHaveAttribute(
      "data-scroll-anchor",
      "false",
    );
    expect(resultHeading.closest('[data-presentation="ticket-card"]')).not.toBeNull();
    expect(resultHeading.closest('[data-slot="card"]')).toHaveClass("border-foreground/25");
    expect(resultHeading.closest('[data-slot="card"]')).toHaveClass("gap-0", "py-0");
    expect(
      resultHeading.closest('[data-slot="card"]')?.querySelector('[data-slot="card-header"]'),
    ).toBeInTheDocument();
    expect(
      resultHeading.closest('[data-slot="card"]')?.querySelector('[data-slot="card-content"]'),
    ).toBeInTheDocument();
    expect(
      resultHeading.closest('[data-slot="card"]')?.querySelector('[data-slot="card-footer"]'),
    ).toBeInTheDocument();
    expect(
      resultHeading.closest('[data-slot="card"]')?.querySelector('[data-slot="card-footer"]'),
    ).toHaveClass("h-11", "py-0");
    expect(resultHeading.closest('[data-slot="item"]')).toBeNull();
    expect(document.querySelector('[data-slot="badge"]')).toBeNull();
    expect(
      screen.getByText("2 Sep · Arsenal FC · venue lists food").closest('[data-slot="marker"]'),
    ).toHaveAttribute("data-variant", "border");
    expect(screen.getByText("Arsenal FC vs Chelsea FC", { exact: true })).toBeVisible();
    expect(screen.getByText("Jerusalem, Israel")).toBeVisible();
    expect(screen.getByText("You are going")).toBeVisible();
    expect(screen.getByText("You are going")).toHaveClass("text-xs");
    expect(screen.getByText("Premier League")).toHaveClass("text-xs");
    expect(screen.getByText("Self-reported venue: Food")).toBeVisible();
    expect(screen.getByText("Hosted by The Corner")).toBeVisible();
    expect(screen.getByRole("img", { name: "Arsenal FC" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Chelsea FC" })).toBeVisible();
    expect(screen.getByRole("link", { name: "North London Supporters" })).toHaveAttribute(
      "href",
      "/groups/north-london-supporters",
    );
    expect(screen.getByText("4 going · 36 places left")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open huddle" })).toHaveClass("text-forest");
  });

  it("renders three matches as three separately bordered tickets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "results",
          interpretation: "2–16 Sep · Premier League",
          locationLabel: "Jerusalem, Israel",
          results: [
            resultCard,
            {
              ...resultCard,
              id: "33333333-3333-4333-8333-333333333333",
              title: "Derby night downtown",
              viewerParticipationState: null,
            },
            {
              ...resultCard,
              id: "44444444-4444-4444-8444-444444444444",
              title: "Supporters club screening",
              viewerParticipationState: "invited",
            },
          ],
        }),
      ),
    );
    render(<AssistedDiscoveryChat />);

    await submit("Premier League huddles in Jerusalem");

    const list = await screen.findByRole("list", { name: "Matching huddles" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
    expect(list.querySelectorAll('[data-presentation="ticket-card"]')).toHaveLength(3);
  });

  it("resets the current exchange from the chat header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · Arsenal FC",
          locationLabel: null,
          results: [resultCard],
        }),
      ),
    );
    render(<AssistedDiscoveryChat />);

    await submit("Arsenal tomorrow");
    expect(await screen.findByRole("heading", { name: "North London watch" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Start a new search" }));

    expect(screen.queryByText("Arsenal tomorrow")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "North London watch" })).not.toBeInTheDocument();
    expect(screen.getByText("What kind of huddle are you after?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start a new search" })).toBeDisabled();
  });

  it("replaces the previous exchange as soon as a new standalone question is sent", async () => {
    let finishSecond!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · Arsenal FC",
          locationLabel: null,
          results: [resultCard],
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishSecond = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<AssistedDiscoveryChat />);

    await submit("Arsenal tomorrow");
    expect(await screen.findByRole("heading", { name: "North London watch" })).toBeVisible();

    await submit("Chelsea next week");
    expect(screen.queryByRole("heading", { name: "North London watch" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Finding the best matches");

    await act(async () => {
      finishSecond(
        await apiResponse({
          status: "no_results",
          interpretation: "7–13 Sep · Chelsea FC",
          locationLabel: null,
          exploreHref: "/discover?team=chelsea",
          planHref: null,
        }),
      );
    });
  });

  it("announces loading, disables duplicate submission, and sends a remembered origin privately", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({ lat: 32.8, lng: 35, label: "Haifa", kind: "address" }),
    );
    render(<AssistedDiscoveryChat />);

    await submit("Arsenal tomorrow");

    expect(screen.getByRole("status")).toHaveTextContent("Finding the best matches");
    expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
    expect(document.querySelector('[data-slot="marker-content"]')).toHaveClass("shimmer");
    expect(document.querySelector('[data-slot="spinner"]')).not.toBeInTheDocument();
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      kind: "interpret",
      query: "Arsenal tomorrow",
      origin: { lat: 32.8, lng: 35 },
    });

    await act(async () => {
      finish(
        await apiResponse({
          status: "no_results",
          interpretation: "2 Sep · Arsenal FC",
          locationLabel: null,
          exploreHref: "/discover?from=2026-09-02",
          planHref: null,
        }),
      );
    });
  });

  it("requests an origin only when needed and continues without another question", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        apiResponse({
          status: "needs_location",
          interpretation: "2 Sep · within 15 km",
          token: "signed.token",
          locationQuery: null,
        }),
      )
      .mockImplementationOnce(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · within 15 km",
          locationLabel: null,
          results: [resultCard],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 32.8, longitude: 35 } } as GeolocationPosition),
    );
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<AssistedDiscoveryChat />);

    const user = await submit("Anything nearby tomorrow?");
    const locationHeading = await screen.findByText("Choose a search origin");
    expect(locationHeading.closest('[data-surface="assistant-state"]')).not.toHaveClass(
      "rounded-2xl",
      "border",
      "bg-card",
    );
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(await screen.findByRole("heading", { name: "North London watch" })).toBeVisible();
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      kind: "continue",
      token: "signed.token",
      origin: { lat: 32.8, lng: 35 },
    });
    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toContain("Current location");
  });

  it("rejects a browser coordinate outside the Israel pilot", async () => {
    const fetcher = vi.fn(() =>
      apiResponse({
        status: "needs_location",
        interpretation: "2 Sep · within 15 km",
        token: "signed.token",
        locationQuery: null,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 40.71, longitude: -74 } } as GeolocationPosition),
      },
    });
    render(<AssistedDiscoveryChat />);

    const user = await submit("Anything nearby tomorrow?");
    await user.click(await screen.findByRole("button", { name: "Use my current location" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That location is outside the Israel pilot.",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("continues through the shared address-origin control", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        apiResponse({
          status: "needs_location",
          interpretation: "2 Sep · within 15 km",
          token: "signed.token",
          locationQuery: null,
        }),
      )
      .mockImplementationOnce(() =>
        apiResponse({
          status: "no_results",
          interpretation: "2 Sep · within 15 km",
          locationLabel: null,
          exploreHref: "/discover?from=2026-09-02",
          planHref: null,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<AssistedDiscoveryChat />);

    const user = await submit("Anything nearby tomorrow?");
    await user.click(await screen.findByText("Search an area or address"));
    await user.click(await screen.findByRole("button", { name: "Use test address" }));

    expect(await screen.findByText("No exact matches this time.")).toBeVisible();
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      kind: "continue",
      origin: { lat: 32.81, lng: 34.99 },
    });
  });

  it.each([
    [
      {
        status: "clarification",
        interpretation: "The search area needs clarification.",
        reason: "unresolved_location",
      },
      "Try a different city, area, or public address in Israel.",
    ],
    [
      {
        status: "unsupported",
        interpretation: "Tickets and payments are outside assisted huddle search.",
        reason: "tickets_or_payments",
      },
      "Tickets and payments are outside assisted huddle search.",
    ],
  ])("renders clarification and unsupported answers", async (body, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => apiResponse(body)),
    );
    render(<AssistedDiscoveryChat />);

    await submit("question");

    const messages = await screen.findAllByText(expected);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.closest('[data-surface="assistant-state"]')).not.toHaveClass(
      "rounded-2xl",
      "border",
      "bg-card",
    );
    expect(screen.getByRole("status")).toHaveTextContent(body.interpretation);
  });

  it("preserves exact Explore and fixture-planning links when no result matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "no_results",
          interpretation: "5 Oct · Arsenal FC",
          locationLabel: "Jerusalem, Israel",
          exploreHref: "/discover?from=2026-10-05&team=team-id",
          planHref: "/events/new?matchId=match-id",
        }),
      ),
    );
    render(<AssistedDiscoveryChat />);

    await submit("Arsenal in Jerusalem on 5 October");

    const noResultsHeading = await screen.findByText("No exact matches this time.");
    expect(noResultsHeading.closest('[data-surface="assistant-state"]')).not.toHaveClass(
      "rounded-2xl",
      "border",
      "bg-card",
    );
    expect(screen.getByText("Jerusalem, Israel")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Explore" })).toHaveAttribute(
      "href",
      "/discover?from=2026-10-05&team=team-id",
    );
    expect(screen.getByRole("link", { name: "Plan this fixture" })).toHaveAttribute(
      "href",
      "/events/new?matchId=match-id",
    );
  });

  it.each([
    [429, "You have reached the assisted-search limit. Try again later."],
    [503, "Assisted search is temporarily unavailable. Explore still works."],
  ])("announces safe HTTP %s errors", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => apiResponse({ error: { code: "SAFE" }, requestId: "request-id" }, status)),
    );
    render(<AssistedDiscoveryChat />);

    await submit("Arsenal tomorrow");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert.closest('[data-slot="bubble"]')).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("supports keyboard submission with one labelled live-status region", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "unsupported",
          interpretation: "That request is outside assisted huddle search.",
          reason: "outside_scope",
        }),
      ),
    );
    render(<AssistedDiscoveryChat />);
    const user = userEvent.setup();

    const input = screen.getByLabelText("Ask Huddle what you want to watch");
    input.focus();
    expect(input).toHaveFocus();
    await user.type(input, "weather tomorrow");
    await user.tab();
    expect(screen.getByRole("button", { name: "Start a new search" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Send question" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "That request is outside assisted huddle search.",
    );
  });
});
