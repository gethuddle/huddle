// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrivateEventForm } from "./private-event-form";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/features/events/actions", () => ({
  finalizeEventDraftAction: vi.fn(),
  saveEventDraftStepAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

const matchId = "60000000-0000-4000-8000-000000000101";
const catalog = {
  matches: [
    {
      id: matchId,
      label: "Arsenal FC vs Chelsea FC — Premier League",
      startsAt: "2026-09-01T17:00:00Z",
      followed: true,
    },
  ],
  groups: [],
  acceptedFriendCount: 2,
} as const;

describe("PrivateEventForm", () => {
  it("keeps legacy callers on the persisted one-phase-at-a-time creation flow", () => {
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    expect(screen.getByRole("heading", { name: "Match" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Arsenal FC vs Chelsea FC — Premier League/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Next: place and audience" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Place and audience" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Longitude|Latitude/)).not.toBeInTheDocument();
  });
});
