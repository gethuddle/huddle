// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget } from "./turnstile-widget";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("next/script", () => ({
  default: function MockScript({ onReady }: ComponentProps<"script"> & { onReady?: () => void }) {
    useEffect(() => onReady?.(), [onReady]);
    return <script data-testid="turnstile-script" />;
  },
}));

describe("TurnstileWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.render.mockImplementation((_container, options) => {
      options.callback("fresh-turnstile-token");
      return "widget-id";
    });
    window.turnstile = {
      render: mocks.render,
      reset: mocks.reset,
      remove: vi.fn(),
    };
  });

  it("renders the requested action and returns a hidden form token", async () => {
    render(<TurnstileWidget action="signup" siteKey="site-key" />);

    await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
    expect(mocks.render).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ action: "signup", sitekey: "site-key" }),
    );
    expect(screen.getByDisplayValue("fresh-turnstile-token")).toHaveAttribute(
      "name",
      "cf-turnstile-response",
    );
  });

  it("resets the retained widget and clears its token when resetKey changes", async () => {
    const { rerender } = render(<TurnstileWidget action="login" resetKey={0} siteKey="site-key" />);
    await screen.findByDisplayValue("fresh-turnstile-token");

    rerender(<TurnstileWidget action="login" resetKey={1} siteKey="site-key" />);

    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith("widget-id"));
    expect(screen.getByDisplayValue("")).toBeInTheDocument();
  });
});
