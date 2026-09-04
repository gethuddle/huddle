// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";
import { ChangePasswordForm } from "./change-password-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SignUpForm } from "./sign-up-form";

const mocks = vi.hoisted(() => ({
  changePasswordAction: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  updatePasswordAction: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => ({
  changePasswordAction: mocks.changePasswordAction,
  requestPasswordResetAction: mocks.requestPasswordResetAction,
  signInAction: mocks.signInAction,
  signUpAction: mocks.signUpAction,
  updatePasswordAction: mocks.updatePasswordAction,
}));

describe("auth forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a labelled signup form and renders its safe success state", async () => {
    mocks.signUpAction.mockResolvedValue({
      ok: true,
      data: {
        message: "If that address can receive Huddle mail, a verification link is on its way.",
        redirectTo: null,
      },
    });
    const user = userEvent.setup();

    render(<SignUpForm />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "fan@example.com");
    await user.type(screen.getByLabelText("Password"), "matchday-strong");
    await user.type(screen.getByLabelText("Confirm password"), "matchday-strong");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(mocks.signUpAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If that address can receive Huddle mail",
    );
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("");
  });

  it("keeps signup credentials available for correction after validation fails", async () => {
    mocks.signUpAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { confirmPassword: ["Passwords must match."] },
      },
    });
    const user = userEvent.setup();

    render(<SignUpForm />);

    const email = screen.getByRole("textbox", { name: "Email address" });
    const password = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");

    await user.type(email, "fan@example.com");
    await user.type(password, "matchday-strong");
    await user.type(confirmation, "different-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Passwords must match.")).toBeVisible();
    expect(email).toHaveValue("fan@example.com");
    expect(password).toHaveValue("matchday-strong");
    expect(confirmation).toHaveValue("different-password");
  });

  it("renders a generic sign-in error without exposing provider details", async () => {
    mocks.signInAction.mockResolvedValue({
      ok: false,
      error: {
        code: "AUTH_FAILED",
        message: "The email or password is incorrect.",
      },
    });
    const user = userEvent.setup();

    render(<SignInForm />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "fan@example.com");
    await user.type(screen.getByLabelText("Password"), "matchday-strong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email or password is incorrect.",
    );
    expect(screen.queryByText(/supabase|identity|registered/i)).not.toBeInTheDocument();
  });

  it("renders form-level security feedback instead of an unhighlighted-field message", async () => {
    mocks.signInAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { _form: ["Please complete the security check and try again."] },
      },
    });
    const user = userEvent.setup();

    render(<SignInForm />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "fan@example.com");
    await user.type(screen.getByLabelText("Password"), "matchday-strong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please complete the security check and try again.",
    );
    expect(
      screen.queryByText("Check the highlighted fields and try again."),
    ).not.toBeInTheDocument();
  });

  it("submits a labelled recovery request and renders the non-enumerating response", async () => {
    mocks.requestPasswordResetAction.mockResolvedValue({
      ok: true,
      data: {
        message: "If that address can receive Huddle mail, a password reset link is on its way.",
        redirectTo: null,
      },
    });
    const user = userEvent.setup();

    render(<ForgotPasswordForm />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "fan@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(mocks.requestPasswordResetAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If that address can receive Huddle mail",
    );
  });

  it("submits labelled matching-password controls and shows safe field feedback", async () => {
    mocks.updatePasswordAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { confirmPassword: ["Passwords must match."] },
      },
    });
    const user = userEvent.setup();

    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText("New password"), "new-matchday-password");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(mocks.updatePasswordAction).toHaveBeenCalledOnce());
    expect(await screen.findByText("Passwords must match.")).toBeVisible();
  });

  it("highlights the current-password field when reauthentication fails", async () => {
    mocks.changePasswordAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: { currentPassword: ["Current password is incorrect."] },
      },
    });
    const user = userEvent.setup();

    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByLabelText("New password"), "new-matchday-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-matchday-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeVisible();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });
});
