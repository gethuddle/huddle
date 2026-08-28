// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/moderation/actions", () => ({
  submitReportAction: vi.fn(),
}));

import { ReportControl } from "./report-control";

describe("ReportControl", () => {
  it("exposes a labelled confidential report form with a sensitive-data warning", async () => {
    const user = userEvent.setup();
    render(
      <ReportControl
        targetId="b1100000-0000-4000-8000-000000000101"
        targetLabel="Fixture huddle"
        targetType="event"
      />,
    );

    await user.click(screen.getByText("Report Fixture huddle"));

    expect(screen.getByLabelText("What happened?")).toBeVisible();
    expect(screen.getByLabelText("Details")).toHaveAttribute("maxlength", "2000");
    expect(screen.getByText(/reports are confidential/i)).toBeVisible();
    expect(screen.getByText(/passwords, payment data/i)).toBeVisible();
  });

  it("shows urgent external-help guidance without removing report submission", async () => {
    const user = userEvent.setup();
    render(<ReportControl targetHandle="fan_one" targetLabel="@fan_one" targetType="profile" />);
    await user.click(screen.getByText("Report @fan_one"));
    await user.selectOptions(screen.getByLabelText("What happened?"), "immediate_danger");

    expect(screen.getByText("Get urgent help first")).toBeVisible();
    expect(screen.getByText(/not an emergency service/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit confidential report" })).toBeEnabled();
  });
});
