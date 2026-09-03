// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPasswordResetAction: vi.fn(),
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => ({
  requestPasswordResetAction: mocks.requestPasswordResetAction,
  signInAction: mocks.signInAction,
  signUpAction: mocks.signUpAction,
}));

describe("auth Turnstile activation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "orphaned-site-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["sign in", async () => (await import("./sign-in-form")).SignInForm],
    ["sign up", async () => (await import("./sign-up-form")).SignUpForm],
    ["password recovery", async () => (await import("./forgot-password-form")).ForgotPasswordForm],
  ])("does not gate %s from a public site key alone", async (_label, loadComponent) => {
    const Form = await loadComponent();

    render(<Form />);

    expect(screen.queryByText("Security check required.")).not.toBeInTheDocument();
  });
});
