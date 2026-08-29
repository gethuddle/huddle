// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfileSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  cityOrder: vi.fn(),
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

vi.mock("@/lib/supabase/anonymous", () => ({
  createAnonymousServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ order: mocks.cityOrder }),
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
        city_id: null,
        display_name: null,
        handle: null,
        profile_completed_at: null,
        rules_accepted_at: null,
        rules_version: null,
        suspended_at: null,
      },
      error: null,
    });
    mocks.cityOrder.mockResolvedValue({ data: [], error: null });
  });

  it("does not render an unusable city select when the catalog is empty", async () => {
    render(await ProfileSettingsPage());

    expect(screen.getByRole("heading", { name: "We couldn’t load the city list." })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("No active Israel cities");
    expect(screen.queryByRole("combobox", { name: "Israel city" })).not.toBeInTheDocument();
  });
});
