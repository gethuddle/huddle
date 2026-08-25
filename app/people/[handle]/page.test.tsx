// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import PublicProfilePage from "./page";

const safeProfileRow = {
  handle: "fan_one",
  display_name: "Fan One",
  city_name: "Haifa",
  bio: "Football and friends.",
  member_since: "2026-08-25T00:00:00Z",
  viewer_has_blocked: false,
};

describe("PublicProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
  });

  it("returns the same non-enumerating not-found outcome for an invalid handle", async () => {
    await expect(
      PublicProfilePage({ params: Promise.resolve({ handle: "invalid-handle" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns not found when the safe projection contains no visible profile", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(
      PublicProfilePage({ params: Promise.resolve({ handle: "missing_user" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders only the reviewed safe DTO to an anonymous visitor", async () => {
    mocks.rpc.mockResolvedValue({ data: [safeProfileRow], error: null });

    render(await PublicProfilePage({ params: Promise.resolve({ handle: "fan_one" }) }));

    expect(screen.getByRole("heading", { name: "Fan One" })).toBeVisible();
    expect(screen.getByText("Haifa")).toBeVisible();
    expect(screen.getByText("Sign in for community controls.")).toBeVisible();
    expect(document.body).not.toHaveTextContent("private@example.com");
    expect(document.body).not.toHaveTextContent("Private supporters group");
  });
});
