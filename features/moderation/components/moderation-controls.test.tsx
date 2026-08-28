// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyModerationAction: vi.fn(),
  assignReportAction: vi.fn(),
  dismissReportAction: vi.fn(),
  reviewModerationAppealAction: vi.fn(),
  reverseModerationAction: vi.fn(),
  submitModerationAppealAction: vi.fn(),
}));

vi.mock("@/features/moderation/actions", () => mocks);

import { AppealControl } from "./appeal-control";
import {
  AppealReviewControl,
  ModerationReversalControl,
  ReportDecisionControls,
} from "./moderation-controls";

const reportId = "b1100000-0000-4000-8000-000000000101";

describe("moderation controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyModerationAction.mockResolvedValue({
      ok: true,
      data: { message: "Moderation action applied and audited." },
    });
  });

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

  it.each([
    ["profile", "feature_restriction"],
    ["profile", "temporary_suspension"],
    ["profile", "permanent_account_ban"],
    ["group", "group_suspension"],
    ["venue", "venue_suspension"],
    ["event", "event_cancellation"],
  ] as const)(
    "puts the %s %s transition behind confirmation",
    async (targetType, selectedAction) => {
      const user = userEvent.setup();
      render(<ReportDecisionControls reportId={reportId} targetType={targetType} />);
      const actionLabel = selectedAction.replaceAll("_", " ");

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Proportional action" }),
        selectedAction,
      );
      await user.click(screen.getByRole("button", { name: `Review ${actionLabel}` }));

      expect(screen.getByRole("alertdialog")).toHaveTextContent(`Apply ${actionLabel}?`);
      expect(mocks.applyModerationAction).not.toHaveBeenCalled();
    },
  );

  it("submits a destructive action only after explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<ReportDecisionControls reportId={reportId} targetType="profile" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Proportional action" }),
      "permanent_account_ban",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Decision reason" }),
      "Repeated severe harm requires a permanent account ban.",
    );
    await user.click(screen.getByRole("button", { name: "Review permanent account ban" }));
    expect(mocks.applyModerationAction).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Confirm permanent account ban",
      }),
    );

    await waitFor(() => expect(mocks.applyModerationAction).toHaveBeenCalledOnce());
    const formData = mocks.applyModerationAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("reportId")).toBe(reportId);
    expect(formData.get("action")).toBe("permanent_account_ban");
    expect(formData.get("reason")).toBe("Repeated severe harm requires a permanent account ban.");
  });

  it("contains focus, cancels with Escape or Cancel, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<ReportDecisionControls reportId={reportId} targetType="event" />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Proportional action" }),
      "event_cancellation",
    );
    const trigger = screen.getByRole("button", { name: "Review event cancellation" });

    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("alertdialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm event cancellation" });
    await waitFor(() => expect(cancel).toHaveFocus());

    await user.tab();
    expect(confirm).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(cancel).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(mocks.applyModerationAction).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(mocks.applyModerationAction).not.toHaveBeenCalled();
  });

  it("keeps non-destructive corrections on the direct submit path", async () => {
    const user = userEvent.setup();
    render(<ReportDecisionControls reportId={reportId} targetType="profile" />);

    await user.type(
      screen.getByRole("textbox", { name: "Decision reason" }),
      "A documented correction is the proportionate response.",
    );
    await user.click(screen.getByRole("button", { name: "Apply and audit action" }));

    await waitFor(() => expect(mocks.applyModerationAction).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
