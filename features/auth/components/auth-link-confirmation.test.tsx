// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthLinkConfirmation } from "./auth-link-confirmation";

describe("AuthLinkConfirmation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/auth/verify/confirm");
  });

  it("reads a fragment, removes it from browser history, and waits for explicit submission", async () => {
    window.location.hash = "#token_hash=secret-token&type=email";
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<AuthLinkConfirmation purpose="email" />);

    const button = await screen.findByRole("button", { name: "Continue securely" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/verify/confirm");
    expect(window.location.hash).toBe("");
    expect(screen.getByText(/may switch the account/i)).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).toHaveAttribute("method", "post");
    expect(button.closest("form")).toHaveAttribute("action", "/auth/verify/confirm/consume");
    expect(document.querySelector('input[name="token_hash"]')).toHaveValue("secret-token");
  });

  it("shows one indistinguishable unavailable state for malformed credentials", async () => {
    window.location.hash = "#token_hash=hash&type=recovery";
    render(<AuthLinkConfirmation purpose="email" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid, expired, or already used/i,
    );
    expect(screen.getByRole("link", { name: "Request another email" })).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });

  it("disables the button immediately after submission", async () => {
    window.location.hash = "#code=secret-code";
    render(<AuthLinkConfirmation purpose="recovery" />);

    const form = (await screen.findByRole("button", { name: "Continue securely" })).closest("form");
    expect(form).not.toBeNull();
    form?.addEventListener("submit", (event) => event.preventDefault());
    await userEvent.click(screen.getByRole("button", { name: "Continue securely" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled());
  });
});
