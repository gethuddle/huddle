// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
      }),
    }),
  }),
}));

describe("ProfileSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email_confirmed_at: "2026-08-29T00:00:00Z",
          id: "profile-user-id",
        },
      },
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: {
        adult_attested_at: null,
        bio: null,
        display_name: null,
        handle: null,
        profile_completed_at: null,
        rules_accepted_at: null,
        rules_version: null,
        suspended_at: null,
      },
      error: null,
    });
  });

  it("renders profile settings without a city catalog or selector", async () => {
    render(await ProfileSettingsPage());

    expect(screen.getByRole("heading", { name: "Complete your Fan profile" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: /city/i })).not.toBeInTheDocument();
  });
});
