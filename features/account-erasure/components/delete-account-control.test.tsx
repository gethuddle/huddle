// @vitest-environment jsdom

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteAccountAction: vi.fn() }));

vi.mock("@/features/account-erasure/actions", () => ({
  deleteAccountAction: mocks.deleteAccountAction,
}));

import { DeleteAccountControl } from "./delete-account-control";

describe("DeleteAccountControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps irreversible deletion behind an accessible confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountControl />);

    const trigger = screen.getByRole("button", { name: "Delete account" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto");
    expect(dialog).toHaveTextContent("sign you out everywhere");
    expect(dialog).toHaveTextContent("cannot be undone");
    expect(within(dialog).getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(within(dialog).getByRole("textbox", { name: "Type DELETE to confirm" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Delete account permanently" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("submits both deliberate confirmations and renders field-specific feedback", async () => {
    mocks.deleteAccountAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { currentPassword: ["Current password is incorrect."] },
      },
    });
    const user = userEvent.setup();
    render(<DeleteAccountControl />);

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete account permanently" }));

    await waitFor(() => expect(mocks.deleteAccountAction).toHaveBeenCalledOnce());
    const formData = mocks.deleteAccountAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("currentPassword")).toBe("wrong-password");
    expect(formData.get("confirmation")).toBe("DELETE");
    expect(await screen.findByText("Current password is incorrect.")).toBeVisible();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });

  it("cannot be dismissed while irreversible deletion is in flight", async () => {
    let resolveAction: ((value: unknown) => void) | undefined;
    mocks.deleteAccountAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<DeleteAccountControl />);

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.type(screen.getByLabelText("Current password"), "current-password");
    await user.type(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByRole("button", { name: "Deleting account…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();

    await act(async () => {
      resolveAction?.({
        ok: false,
        error: { code: "UPSTREAM_UNAVAILABLE", message: "Please try again." },
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
  });

  it("resets failed-attempt feedback after an idle cancel and fresh reopen", async () => {
    mocks.deleteAccountAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { confirmation: ["Type DELETE exactly to confirm."] },
      },
    });
    const user = userEvent.setup();
    render(<DeleteAccountControl />);

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.type(screen.getByLabelText("Current password"), "current-password");
    await user.type(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), "delete");
    await user.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByText("Type DELETE exactly to confirm.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Type DELETE to confirm" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.queryByText("Type DELETE exactly to confirm.")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Type DELETE to confirm" })).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("renders safe form-level failure copy without leaking provider detail", async () => {
    mocks.deleteAccountAction.mockResolvedValue({
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "That service is temporarily unavailable. Try again later.",
        fields: { _form: ["We could not finish deleting the account. Try again."] },
      },
    });
    const user = userEvent.setup();
    render(<DeleteAccountControl />);

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.type(screen.getByLabelText("Current password"), "current-password");
    await user.type(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not finish deleting the account. Try again.",
    );
    expect(screen.queryByText(/provider detail/i)).not.toBeInTheDocument();
  });
});
