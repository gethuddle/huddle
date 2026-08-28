// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/moderation/actions", () => ({
  applyModerationAction: vi.fn(),
  assignReportAction: vi.fn(),
  dismissReportAction: vi.fn(),
  reviewModerationAppealAction: vi.fn(),
  reverseModerationAction: vi.fn(),
  submitModerationAppealAction: vi.fn(),
}));

import { AppealControl } from "./appeal-control";
import {
  AppealReviewControl,
  ModerationReversalControl,
  ReportDecisionControls,
} from "./moderation-controls";

const reportId = "b1100000-0000-4000-8000-000000000101";

describe("moderation controls", () => {
  it("offers only target-compatible actions and reveals a labelled duration for timed actions", async () => {
    const user = userEvent.setup();
    render(<ReportDecisionControls reportId={reportId} targetType="profile" />);

    const action = screen.getByRole("combobox", { name: "Proportional action" });
    expect(action).toHaveValue("content_correction");
    expect(screen.getByRole("option", { name: "temporary suspension" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "group suspension" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Decision reason" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Reason to close without action" })).toBeRequired();

    await user.selectOptions(action, "temporary_suspension");
    expect(screen.getByRole("combobox", { name: "Duration" })).toHaveValue("24");
  });

  it("gives appeal submission and independent review fields accessible names", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AppealControl moderationActionId={reportId} />);

    await user.click(screen.getByText("Appeal this action"));
    expect(
      screen.getByRole("textbox", { name: "Why should this decision be reviewed?" }),
    ).toBeRequired();
    expect(screen.getByText(/different moderator reviews the appeal/i)).toBeVisible();

    rerender(<AppealReviewControl appealId={reportId} />);
    expect(screen.getByRole("combobox", { name: "Outcome" })).toHaveValue("uphold");
    expect(screen.getByRole("textbox", { name: "Outcome reason" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Record outcome" })).toBeEnabled();
  });

  it("requires a labelled reason before an audited direct reversal", async () => {
    const user = userEvent.setup();
    render(<ModerationReversalControl moderationActionId={reportId} />);

    await user.click(screen.getByText("Reverse with audit evidence"));
    expect(screen.getByRole("textbox", { name: "Reversal reason" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Record reversal" })).toBeEnabled();
  });
});
