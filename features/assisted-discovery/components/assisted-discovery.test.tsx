// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistedDiscovery } from "./assisted-discovery";

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

function apiResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

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
  viewerParticipationState: null,
  venueFacilities: ["food"],
  matchedReasons: ["Venue lists food."],
};

async function submitQuery(query = "Arsenal tomorrow with food") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Describe the huddle you want"), query);
  await user.click(screen.getByRole("button", { name: "Find huddles" }));
  return user;
}

describe("AssistedDiscovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("announces loading and disables duplicate submissions", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(<AssistedDiscovery />);

    await submitQuery();

    expect(screen.getByRole("status")).toHaveTextContent("Finding the best matches");
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.getByRole("button", { name: "Find huddles" })).toBeDisabled();

    await act(async () => {
      resolveRequest(
        await apiResponse({
          status: "no_results",
          interpretation: "2 Sep · Arsenal FC",
          exploreHref: "/discover?from=2026-09-02",
          planHref: null,
        }),
      );
    });
  });

  it("requests location only when needed, remembers it in session, and continues once", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        apiResponse({
          status: "needs_location",
          interpretation: "2 Sep · venue-hosted · within 15 km",
          token: "signed.token",
          locationQuery: null,
        }),
      )
      .mockImplementationOnce(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · venue-hosted · within 15 km",
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
    render(<AssistedDiscovery />);

    const user = await submitQuery();
    expect(await screen.findByText("Choose a search origin")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(await screen.findByRole("heading", { name: "North London watch" })).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      kind: "continue",
      token: "signed.token",
      origin: { lat: 32.8, lng: 35 },
    });
    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toContain("Current location");
  });

  it("asks to confirm a named place instead of offering the remembered or current origin", async () => {
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({ lat: 32.8, lng: 35, label: "Haifa", kind: "address" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "needs_location",
          interpretation: "9 Sep",
          token: "signed.token",
          locationQuery: "Jerusalem",
        }),
      ),
    );
    render(<AssistedDiscovery />);

    await submitQuery("Anything in Jerusalem next Wednesday?");

    expect(
      await screen.findByRole("heading", { name: "Confirm Jerusalem as the search area" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Use my current location" }),
    ).not.toBeInTheDocument();
  });

  it("rejects browser coordinates outside the Israel pilot without continuing", async () => {
    const fetcher = vi.fn(() =>
      apiResponse({
        status: "needs_location",
        interpretation: "2 Sep · venue-hosted · within 15 km",
        token: "signed.token",
        locationQuery: null,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 40.71, longitude: -74 } } as GeolocationPosition),
    );
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<AssistedDiscovery />);

    const user = await submitQuery();
    await user.click(await screen.findByRole("button", { name: "Use my current location" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That location is outside the Israel pilot.",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBeNull();
  });

  it("can continue from the shared address-origin flow", async () => {
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
          exploreHref: "/discover?from=2026-09-02",
          planHref: null,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<AssistedDiscovery />);

    const user = await submitQuery();
    await user.click(await screen.findByRole("button", { name: "Use test address" }));

    expect(await screen.findByText("No exact matches this time.")).toBeVisible();
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      kind: "continue",
      origin: { lat: 32.81, lng: 34.99 },
    });
  });

  it("renders one compact result list with crests, group context, and useful event details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · Arsenal FC · venue lists food",
          results: [{ ...resultCard, viewerParticipationState: "approved" }],
        }),
      ),
    );
    render(<AssistedDiscovery />);

    await submitQuery();

    expect(await screen.findByRole("heading", { name: "North London watch" })).toBeVisible();
    expect(screen.getByText("You are going")).toBeVisible();
    expect(screen.getByText("Self-reported: Food")).toBeVisible();
    expect(screen.getByText("Hosted by The Corner")).toBeVisible();
    expect(
      screen.getByText("Self-listed venue · business identity not checked by Huddle"),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Arsenal FC" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Chelsea FC" })).toBeVisible();
    expect(screen.getByRole("link", { name: "North London Supporters" })).toHaveAttribute(
      "href",
      "/groups/north-london-supporters",
    );
    expect(screen.getByText("4 going · 36 places left")).toBeVisible();
    expect(screen.getByRole("list", { name: "Matching huddles" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open huddle" })).toHaveAttribute(
      "href",
      `/events/${resultCard.id}`,
    );
  });

  it("keeps existing results mounted while a new search loads", async () => {
    let resolveSecondRequest!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        apiResponse({
          status: "results",
          interpretation: "2 Sep · Arsenal FC",
          results: [resultCard],
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondRequest = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<AssistedDiscovery />);

    const user = await submitQuery();
    expect(await screen.findByRole("heading", { name: "North London watch" })).toBeVisible();

    const input = screen.getByLabelText("Describe the huddle you want");
    await user.clear(input);
    await user.type(input, "Chelsea next week");
    await user.click(screen.getByRole("button", { name: "Find huddles" }));

    expect(screen.getByRole("heading", { name: "North London watch" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Finding the best matches");

    await act(async () => {
      resolveSecondRequest(
        await apiResponse({
          status: "no_results",
          interpretation: "Next week · Chelsea FC",
          exploreHref: "/discover?team=chelsea",
          planHref: null,
        }),
      );
    });
  });

  it.each([
    [
      {
        status: "clarification",
        interpretation: "The team name needs clarification.",
        reason: "unresolved_team",
      },
      "Try the official team or competition name.",
    ],
    [
      {
        status: "unsupported",
        interpretation: "Tickets and payments are outside assisted huddle search.",
        reason: "tickets_or_payments",
      },
      "Tickets and payments are outside assisted huddle search.",
    ],
  ])("renders clarification and unsupported responses", async (body, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => apiResponse(body)),
    );
    render(<AssistedDiscovery />);

    await submitQuery();

    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(body.interpretation);
  });

  it("keeps exact no-results filters in ordinary Explore and planning links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        apiResponse({
          status: "no_results",
          interpretation: "2 Sep · Arsenal FC",
          exploreHref: "/discover?from=2026-09-02&team=team-id",
          planHref: "/events/new?matchId=match-id",
        }),
      ),
    );
    render(<AssistedDiscovery />);

    await submitQuery();

    expect(await screen.findByText("No exact matches this time.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Explore" })).toHaveAttribute(
      "href",
      "/discover?from=2026-09-02&team=team-id",
    );
    expect(screen.getByRole("link", { name: "Plan this fixture" })).toHaveAttribute(
      "href",
      "/events/new?matchId=match-id",
    );
  });

  it.each([
    [429, "You have reached the assisted-search limit. Try again later."],
    [503, "Assisted search is temporarily unavailable. Explore still works."],
  ])("announces safe API error state for HTTP %s", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => apiResponse({ error: { code: "SAFE" }, requestId: "request-id" }, status)),
    );
    render(<AssistedDiscovery />);

    await submitQuery();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("supports keyboard submission with a labelled control and live status", async () => {
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
    render(<AssistedDiscovery />);
    const user = userEvent.setup();

    await user.tab();
    expect(screen.getByLabelText("Describe the huddle you want")).toHaveFocus();
    await user.type(screen.getByLabelText("Describe the huddle you want"), "weather tomorrow");
    await user.tab();
    expect(screen.getByRole("button", { name: "Find huddles" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "That request is outside assisted huddle search.",
      ),
    );
  });
});
