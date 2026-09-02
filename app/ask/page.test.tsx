// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  enabled: true,
  notFound: vi.fn(),
  requireActor: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({ ASSISTED_DISCOVERY_ENABLED: mocks.enabled }),
}));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/features/assisted-discovery/components/assisted-discovery-chat", () => ({
  AssistedDiscoveryChat: () => (
    <section aria-label="Ask Huddle conversation">
      <h1>Ask Huddle</h1>
    </section>
  ),
}));

import AskPage from "./page";

describe("AskPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.requireActor.mockResolvedValue({ user: { id: "fan-id" } });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("requires an activated Fan and renders the standalone chat", async () => {
    render(await AskPage());

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(screen.getByRole("heading", { name: "Ask Huddle" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Ask Huddle conversation" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Ask Huddle conversation" }).parentElement,
    ).toHaveAttribute("data-shell-mode", "immersive");
  });

  it("stays undiscoverable when the feature flag is disabled", async () => {
    mocks.enabled = false;

    await expect(AskPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("shows the normal Fan recovery state when the account is not eligible", async () => {
    mocks.requireActor.mockRejectedValue(new DomainError("PROFILE_INCOMPLETE"));

    render(await AskPage());

    expect(screen.getByRole("heading")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Ask Huddle conversation" }),
    ).not.toBeInTheDocument();
  });
});
