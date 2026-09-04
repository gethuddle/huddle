// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EventDraftValues } from "@/features/events/schemas";

import { EventCreateFlow } from "./event-create-flow";

const mocks = vi.hoisted(() => ({
  finalizeEventDraftAction: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  saveEventDraftStepAction: vi.fn(),
}));

vi.mock("@/features/events/actions", () => ({
  finalizeEventDraftAction: mocks.finalizeEventDraftAction,
  saveEventDraftStepAction: mocks.saveEventDraftStepAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
  },
}));
vi.mock("@/features/locations/components/address-search", () => ({
  AddressSearch: ({
    onConfirm,
    purpose,
  }: {
    onConfirm: (value: unknown) => void;
    purpose: "origin" | "public_address" | "private_home";
  }) => (
    <button
      onClick={() =>
        onConfirm({
          id: "address-1",
          label: "10 Herzl Street, Haifa, Israel",
          latitude: 32.815,
          longitude: 34.989,
        })
      }
      type="button"
    >
      {purpose === "private_home" ? "Choose protected test address" : "Choose test address"}
    </button>
  ),
}));
vi.mock("@/features/locations/components/map-pin-picker", () => ({
  MapPinPicker: ({ onChange }: { onChange: (value: unknown) => void }) => (
    <button onClick={() => onChange({ latitude: 32.813, longitude: 34.999 })} type="button">
      Adjust protected test pin
    </button>
  ),
}));

const draftId = "60000000-0000-4000-8000-000000000111";
const matchId = "60000000-0000-4000-8000-000000000101";
const catalog = {
  matches: [
    {
      id: matchId,
      label: "Arsenal FC vs Chelsea FC — Premier League",
      startsAt: "2026-09-01T17:00:00Z",
      followed: true,
    },
    {
      id: "60000000-0000-4000-8000-000000000102",
      label: "Liverpool FC vs Everton FC — Premier League",
      startsAt: "2026-09-04T17:00:00Z",
      followed: false,
    },
  ],
  groups: [],
  acceptedFriendCount: 2,
} as const;

function saved(
  step: 1 | 2 | 3,
  values: EventDraftValues,
  protectedLocation: Readonly<{
    addressText: string;
    directionsText: string | null;
    latitude: number;
    longitude: number;
  }> | null = null,
) {
  return {
    ok: true as const,
    data: {
      draft: { id: draftId, step, values, savedAt: "2026-08-30T10:00:00+00:00" },
      organizingGroupId: null,
      protectedLocation,
    },
  };
}

describe("EventCreateFlow", () => {
  it("confirms a dirty draft before an actual outside Next link can navigate", async () => {
    const navigate = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <>
        <Link
          href="/explore"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Explore
        </Link>
        <EventCreateFlow
          catalog={catalog}
          initialDraft={{
            id: draftId,
            step: 2,
            values: { matchId, title: "Saved title" },
            savedAt: "2026-09-04T10:00:00Z",
          }}
        />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Event title"), " changed");
    await userEvent.click(screen.getByRole("link", { name: "Explore" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("without saving"));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Event title")).toHaveValue("Saved title changed");
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("link", { name: "Explore" }));
    expect(navigate).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("blocks outside links while saving and removes the guard when the flow unmounts", async () => {
    const navigate = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const pending = Promise.withResolvers<ReturnType<typeof saved>>();
    mocks.saveEventDraftStepAction.mockReturnValue(pending.promise);
    const view = render(
      <>
        <Link
          href="/explore"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Explore
        </Link>
        <EventCreateFlow catalog={catalog} initialMatchId={matchId} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save and exit" }));
    try {
      await userEvent.click(screen.getByRole("link", { name: "Explore" }));
      expect(navigate).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    } finally {
      await act(async () => pending.resolve(saved(1, { matchId })));
    }
    view.rerender(
      <Link
        href="/explore"
        onClick={(event) => {
          event.preventDefault();
          navigate();
        }}
      >
        Explore
      </Link>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Explore" }));
    expect(navigate).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("cancels supported same-document history traversal without rewriting history", async () => {
    const navigation = new EventTarget();
    vi.stubGlobal("navigation", navigation);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId, title: "Saved title" },
          savedAt: "2026-09-04T10:00:00Z",
        }}
      />,
    );
    await userEvent.type(screen.getByLabelText("Event title"), " changed");
    const traverse = new Event("navigate", { cancelable: true });
    Object.assign(traverse, { navigationType: "traverse", destination: { sameDocument: true } });
    navigation.dispatchEvent(traverse);
    expect(traverse.defaultPrevented).toBe(true);
    confirm.mockClear();
    const unsupported = new Event("navigate");
    Object.assign(unsupported, { navigationType: "traverse", destination: { sameDocument: true } });
    navigation.dispatchEvent(unsupported);
    expect(confirm).not.toHaveBeenCalled();
    expect(unsupported.defaultPrevented).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    confirm.mockRestore();
    pushState.mockRestore();
    replaceState.mockRestore();
  });

  it("does not warn for clean links or modified clicks that keep the dirty editor open", async () => {
    const navigate = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <>
        <Link
          href="/explore"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Explore
        </Link>
        <EventCreateFlow
          catalog={catalog}
          initialDraft={{
            id: draftId,
            step: 2,
            values: { matchId, title: "Saved title" },
            savedAt: "2026-09-04T10:00:00Z",
          }}
        />
      </>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Explore" }));
    expect(navigate).toHaveBeenCalledOnce();
    await userEvent.type(screen.getByLabelText("Event title"), " changed");
    const newTabClick = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    screen.getByRole("link", { name: "Explore" }).dispatchEvent(newTabClick);
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("offers draft recovery until edits need saving, then keeps Save and exit available", async () => {
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId, title: "Saved title" },
          savedAt: "2026-09-04T10:00:00Z",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Saved drafts" })).toHaveAttribute(
      "href",
      "/events/drafts",
    );
    await userEvent.type(screen.getByLabelText("Event title"), " changed");
    expect(screen.queryByRole("link", { name: "Saved drafts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and exit" })).toBeEnabled();
  });
  it("prevents edits being overwritten while a draft save is pending", async () => {
    let finish: (value: ReturnType<typeof saved>) => void = () => undefined;
    mocks.saveEventDraftStepAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId, title: "Saved title" },
          savedAt: "2026-09-04T10:00:00Z",
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save and exit" }));
    try {
      expect(screen.getByLabelText("Event title")).toBeDisabled();
    } finally {
      await act(async () => finish(saved(2, { matchId, title: "Saved title" })));
    }
  });
  it("saves the current step before leaving for the recoverable draft list", async () => {
    render(<EventCreateFlow catalog={catalog} initialMatchId={matchId} />);
    await userEvent.click(screen.getByRole("button", { name: "Save and exit" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/events/drafts"));
    expect(mocks.saveEventDraftStepAction).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, values: expect.objectContaining({ matchId }) }),
    );
  });
  it("explains public-place group previews without overpromising members-only visibility", () => {
    render(
      <EventCreateFlow
        catalog={{
          ...catalog,
          groups: [
            {
              id: "60000000-0000-4000-8000-000000000222",
              name: "Supporters",
              slug: "supporters",
              lifecycle: "active",
            },
          ],
        }}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId, placeKind: "public_place", audience: "group" },
          savedAt: "2026-09-04T10:00:00Z",
        }}
      />,
    );
    expect(
      screen.getByRole("radio", { name: /Group.*eligible signed-in fans can preview/i }),
    ).toBeVisible();
    expect(screen.queryByText(/Appears in Explore only to active members/)).not.toBeInTheDocument();
  });
  it("keeps the wizard pending until step save acknowledges and shows transport failure", async () => {
    let rejectSave: (error: Error) => void = () => undefined;
    mocks.saveEventDraftStepAction.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    render(<EventCreateFlow catalog={catalog} initialMatchId={matchId} />);
    await userEvent.click(screen.getByRole("button", { name: "Next: place and audience" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    rejectSave(new Error("Offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next: place and audience" })).toBeEnabled(),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    let stored: EventDraftValues = {};
    mocks.saveEventDraftStepAction.mockImplementation(
      async (input: { step: 1 | 2 | 3; values: EventDraftValues }) => {
        stored = { ...stored, ...input.values };
        return saved(input.step, stored);
      },
    );
  });

  it("renders one real phase at a time, persists Next and Back, and reviews human-readable answers", async () => {
    const user = userEvent.setup();
    render(<EventCreateFlow catalog={catalog} />);

    expect(screen.getByRole("heading", { name: "Match" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Place and audience" })).not.toBeInTheDocument();

    const fixtureSearch = screen.getByRole("searchbox", { name: "Search fixtures" });
    await user.type(fixtureSearch, "Chelsea");
    await user.click(
      screen.getByRole("button", { name: /Arsenal FC vs Chelsea FC — Premier League/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next: place and audience" }));

    expect(await screen.findByRole("heading", { name: "Place and audience" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Event title" })).toBeEnabled());
    expect(mocks.saveEventDraftStepAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: null,
        step: 2,
        values: expect.objectContaining({ matchId }),
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith(`/events/new?draft=${draftId}`);

    await user.type(screen.getByRole("textbox", { name: "Event title" }), "North stand night");
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Watch the match together with local supporters.",
    );
    expect(screen.queryByRole("combobox", { name: /city/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Public place/ }));
    await user.type(screen.getByRole("textbox", { name: "Place name" }), "The Green Room");
    await user.click(screen.getByRole("button", { name: "Choose test address" }));
    await user.click(screen.getByRole("checkbox", { name: /I will be present/ }));
    await user.click(screen.getByRole("button", { name: "Next: review and publish" }));

    expect(await screen.findByRole("heading", { name: "Review and publish" })).toBeVisible();
    expect(screen.getByText("Arsenal FC vs Chelsea FC — Premier League")).toBeVisible();
    expect(screen.getByText("10 Herzl Street, Haifa, Israel")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit match" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit place and audience" })).toBeVisible();

    await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Place and audience" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Event title" })).toBeEnabled());
    expect(mocks.saveEventDraftStepAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: draftId, step: 2 }),
    );
  });

  it("retains a remotely searched fixture's metadata through Fan review", async () => {
    const remoteMatch = {
      id: "60000000-0000-4000-8000-000000000999",
      label: "Late Horizon FC vs Final Round FC — Premier League",
      startsAt: "2027-05-30T17:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [remoteMatch], page: 1, hasMore: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<EventCreateFlow catalog={{ ...catalog, matchesHasMore: true }} />);

    await user.type(screen.getByRole("searchbox", { name: "Search fixtures" }), "Late Horizon");
    await user.click(await screen.findByRole("button", { name: new RegExp(remoteMatch.label) }));
    await user.click(screen.getByRole("button", { name: "Next: place and audience" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Event title" })).toBeEnabled());
    await user.type(screen.getByRole("textbox", { name: "Event title" }), "Late final night");
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Watch the late fixture together with local supporters.",
    );
    await user.click(screen.getByRole("radio", { name: /Public place/ }));
    await user.type(screen.getByRole("textbox", { name: "Place name" }), "The Green Room");
    await user.click(screen.getByRole("button", { name: "Choose test address" }));
    await user.click(screen.getByRole("checkbox", { name: /I will be present/ }));
    await user.click(screen.getByRole("button", { name: "Next: review and publish" }));

    expect(await screen.findByRole("heading", { name: "Review and publish" })).toBeVisible();
    expect(screen.getByText(remoteMatch.label)).toBeVisible();
    expect(screen.queryByText("Fixture not selected")).not.toBeInTheDocument();
  });

  it("persists dirty Phase 2 edits before the first-friend recovery detour", async () => {
    const user = userEvent.setup();
    render(
      <EventCreateFlow
        catalog={{ ...catalog, acceptedFriendCount: 0 }}
        initialDraft={{
          id: draftId,
          step: 2,
          values: {
            matchId,
            title: "Saved title",
            description: "A description long enough to save.",
          },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
      />,
    );

    await user.clear(screen.getByRole("textbox", { name: "Event title" }));
    await user.type(screen.getByRole("textbox", { name: "Event title" }), "Dirty title");
    await user.click(screen.getByRole("button", { name: "Find your first friend" }));

    await waitFor(() =>
      expect(mocks.saveEventDraftStepAction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: draftId,
          step: 2,
          values: expect.objectContaining({ title: "Dirty title" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        `/people?returnTo=${encodeURIComponent(`/events/new?draft=${draftId}`)}`,
      ),
    );
  });

  it("explains each audience in Explore terms and keeps group review advanced", () => {
    render(
      <EventCreateFlow
        catalog={{
          ...catalog,
          groups: [
            {
              id: "60000000-0000-4000-8000-000000000105",
              name: "Weekend Crew",
              slug: "weekend-crew",
              lifecycle: "active",
            },
          ],
        }}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
      />,
    );

    expect(screen.getByRole("radio", { name: /Group.*active members/i })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /Supporter group/i })).not.toBeInTheDocument();
    expect(screen.getByText(/stays out of Explore/i)).toBeVisible();
    expect(screen.getByText(/accepted friends/i)).toBeVisible();
    expect(screen.getByText(/active members of one group/i)).toBeVisible();
    expect(screen.getByLabelText("Group")).not.toBeVisible();
    expect(screen.getByText("Submit through a group (optional)")).toBeVisible();
  });

  it("clears stale protected and public locations when place kind changes", async () => {
    const user = userEvent.setup();
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: {
            matchId,
            placeKind: "home",
            publicPlaceName: "Stale venue",
            publicAddressText: "Stale public address",
            publicLatitude: 32.8,
            publicLongitude: 34.9,
          },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
        initialProtectedLocation={{
          addressText: "Old protected home",
          directionsText: null,
          latitude: 32.81,
          longitude: 34.99,
        }}
      />,
    );

    expect(screen.getByText(/protected home address and pin are saved/i)).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /Public place/ }));
    expect(screen.queryByText(/protected home address and pin are saved/i)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Place name" })).toHaveValue("");
    expect(screen.queryByText("Stale public address")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /My home/ }));
    expect(screen.getByRole("button", { name: "Choose protected test address" })).toBeVisible();
  });

  it("uses the server-returned protected state as authoritative on review", async () => {
    mocks.saveEventDraftStepAction.mockResolvedValue(
      saved(3, {
        matchId,
        title: "Public switch",
        description: "A public event after leaving the saved home.",
        expectedActivity: "Watch the full match together",
        costDescription: "Free",
        eventRules: "Respect everyone.",
        commercialAffiliation: "None",
        hostPresenceConfirmed: true,
        placeKind: "public_place",
        publicPlaceName: "Canonical cafe",
        publicAddressText: "10 Herzl Street, Haifa, Israel",
        publicLatitude: 32.815,
        publicLongitude: 34.989,
        audience: "invite_only",
        capacity: 6,
      }),
    );
    const user = userEvent.setup();
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: {
            matchId,
            title: "Public switch",
            description: "A public event after leaving the saved home.",
            placeKind: "home",
            audience: "invite_only",
            capacity: 6,
            hostPresenceConfirmed: true,
          },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
        initialProtectedLocation={{
          addressText: "Old protected home",
          directionsText: null,
          latitude: 32.81,
          longitude: 34.99,
        }}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /Public place/ }));
    await user.type(screen.getByRole("textbox", { name: "Place name" }), "Canonical cafe");
    await user.click(screen.getByRole("button", { name: "Choose test address" }));
    await user.click(screen.getByRole("button", { name: "Next: review and publish" }));

    expect(await screen.findByRole("heading", { name: "Review and publish" })).toBeVisible();
    expect(screen.getByText("10 Herzl Street, Haifa, Israel")).toBeVisible();
    expect(screen.queryByText("Old protected home")).not.toBeInTheDocument();
  });

  it("saves a home pin through the protected channel without generic location fields", async () => {
    const user = userEvent.setup();
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Event title" }), "Home match night");
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "A small watch night for approved Huddle supporters.",
    );
    await user.click(screen.getByRole("button", { name: "Choose protected test address" }));
    await user.click(screen.getByRole("checkbox", { name: /I will be present/ }));
    await user.click(screen.getByRole("button", { name: "Next: review and publish" }));

    expect(await screen.findByRole("heading", { name: "Review and publish" })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Publish event" })).toBeEnabled(),
    );
    await waitFor(() => expect(mocks.saveEventDraftStepAction).toHaveBeenCalledOnce());
    const savedInput = mocks.saveEventDraftStepAction.mock.calls[0]?.[0];
    expect(savedInput).toMatchObject({
      privateLocation: {
        mode: "replace",
        value: {
          addressText: "10 Herzl Street, Haifa, Israel",
          latitude: 32.815,
          longitude: 34.989,
        },
      },
      values: expect.objectContaining({ placeKind: "home" }),
    });
    expect(JSON.stringify(savedInput.values)).not.toContain("10 Herzl Street");
    expect(
      screen.queryByRole("spinbutton", { name: /latitude|longitude/i }),
    ).not.toBeInTheDocument();
  });

  it("explains every missing review field inline and focuses the first one", async () => {
    const user = userEvent.setup();
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 2,
          values: { matchId },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next: review and publish" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fix 4 details before review");
    expect(alert).toHaveTextContent("Use at least 3 characters for the event title.");
    expect(alert).toHaveTextContent("Use at least 10 characters for the description.");
    expect(alert).toHaveTextContent("Choose the private address and pin.");
    expect(alert).toHaveTextContent("Confirm that you will be present.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Event title" })).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Event title" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mocks.saveEventDraftStepAction).not.toHaveBeenCalled();
  });

  it("finalizes the persisted draft from the review phase", async () => {
    mocks.finalizeEventDraftAction.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Navigation did not complete." },
    });
    const user = userEvent.setup();
    render(
      <EventCreateFlow
        catalog={catalog}
        initialDraft={{
          id: draftId,
          step: 3,
          values: {
            matchId,
            title: "North stand night",
            description: "Watch the match together with local supporters.",
            expectedActivity: "Watch the full match together",
            costDescription: "Free",
            eventRules: "Respect the host and every attendee.",
            commercialAffiliation: "None",
            hostPresenceConfirmed: true,
            placeKind: "public_place",
            publicPlaceName: "The Green Room",
            publicAddressText: "10 Herzl Street, Haifa, Israel",
            publicLatitude: 32.815,
            publicLongitude: 34.989,
            audience: "invite_only",
            capacity: 6,
          },
          savedAt: "2026-08-30T10:00:00+00:00",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publish event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Navigation did not complete.");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Publish event" })).toBeEnabled(),
    );
    await waitFor(() => expect(mocks.finalizeEventDraftAction).toHaveBeenCalledWith({ draftId }));
  });
});
