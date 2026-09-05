// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ acceptCommonOnboardingAction: vi.fn() }));

vi.mock("@/features/workspaces/actions", () => ({
  acceptCommonOnboardingAction: mocks.acceptCommonOnboardingAction,
}));

import { CommonOnboardingForm } from "./common-onboarding-form";

describe("CommonOnboardingForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves the checked age confirmation and identifies missing rules for this attempt only", async () => {
    mocks.acceptCommonOnboardingAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { rulesAccepted: ["This confirmation is required."] },
      },
      values: { adultAttested: true, rulesAccepted: false },
      attempt: 1,
    });
    const user = userEvent.setup();
    const view = render(<CommonOnboardingForm />);
    const age = screen.getByRole("checkbox", { name: /18 or older/i });

    await user.click(age);
    await user.click(screen.getByRole("button", { name: "Continue to venue details" }));

    await waitFor(() => expect(mocks.acceptCommonOnboardingAction).toHaveBeenCalledOnce());
    expect(screen.getByRole("checkbox", { name: /18 or older/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /accept the current/i })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("checkbox", { name: /accept the current/i }),
    ).toHaveAccessibleDescription("This confirmation is required.");

    view.unmount();
    render(<CommonOnboardingForm />);
    expect(screen.getByRole("checkbox", { name: /18 or older/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /accept the current/i })).not.toBeChecked();
  });
});
