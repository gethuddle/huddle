// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

const mocks = vi.hoisted(() => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => ({
  signInAction: mocks.signInAction,
  signUpAction: mocks.signUpAction,
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
});
