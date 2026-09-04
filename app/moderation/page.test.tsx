// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listModerationAppeals: vi.fn(),
  listModerationReports: vi.fn(),
  listPlatformModerationActions: vi.fn(),
  requireActor: vi.fn(),
  viewerIsPlatformModerator: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/features/moderation/queries", () => ({
  listModerationAppeals: mocks.listModerationAppeals,
  listModerationReports: mocks.listModerationReports,
  listPlatformModerationActions: mocks.listPlatformModerationActions,
  viewerIsPlatformModerator: mocks.viewerIsPlatformModerator,
}));
vi.mock("@/features/moderation/components/moderation-controls", () => ({
  AppealReviewControl: () => null,
  ModerationReversalControl: () => null,
  ReportAssignmentControl: () => null,
  ReportDecisionControls: () => null,
}));

import ModerationPage from "./page";

describe("ModerationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({
      profile: { id: "b1100000-0000-4000-8000-000000000001" },
    });
    mocks.viewerIsPlatformModerator.mockResolvedValue(true);
    mocks.listPlatformModerationActions.mockResolvedValue([]);
  });

  it("renders erased queue identities as neutral text without an @ handle or profile link", async () => {
    mocks.listModerationReports.mockResolvedValue([
      {
        report_id: "b1100000-0000-4000-8000-000000000101",
        reporter_handle: null,
        target_type: "profile",
        target_id: "b1100000-0000-4000-8000-000000000102",
        target_label: "reported_fan",
        category: "other",
        details: "A bounded factual account for the platform moderator.",
        status: "open",
        assigned_to_me: false,
        created_at: "2026-08-28T16:00:00Z",
      },
    ]);
    mocks.listModerationAppeals.mockResolvedValue([
      {
        appeal_id: "b1100000-0000-4000-8000-000000000501",
        moderation_action_id: "b1100000-0000-4000-8000-000000000701",
        appellant_handle: null,
        action: "temporary_suspension",
        appeal_reason: "Please review the factual context.",
        status: "open",
        original_moderator_id: "b1100000-0000-4000-8000-000000000702",
        can_current_moderator_review: true,
        created_at: "2026-08-28T16:00:00Z",
      },
    ]);

    render(await ModerationPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Reported by Account unavailable")).toBeVisible();
    expect(screen.getByText("Account unavailable")).toBeVisible();
    expect(document.body).not.toHaveTextContent("@Account unavailable");
    expect(screen.queryByRole("link", { name: /account unavailable/i })).not.toBeInTheDocument();
  });
});
