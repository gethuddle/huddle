import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anonymousClient: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/anonymous", () => ({
  createAnonymousServerClient: mocks.anonymousClient,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import FanOnboardingPage from "./page";

describe("FanOnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "e4000000-0000-4000-8000-000000000101",
              email_confirmed_at: "2026-08-30T08:00:00Z",
            },
          },
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                handle: "existing_fan",
                display_name: "Existing Fan",
                bio: "",
                adult_attested_at: "2026-08-01T08:00:00Z",
                rules_version: 2,
                rules_accepted_at: "2026-08-01T08:00:00Z",
                profile_completed_at: "2026-08-01T08:00:00Z",
                fan_enabled_at: "2026-08-01T08:00:00Z",
                suspended_at: null,
                community_restricted_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    mocks.anonymousClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "e4000000-0000-4000-8000-000000000201",
                  slug: "haifa",
                  name_en: "Haifa",
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });
  });

  it("routes an enabled Fan with stale rules to common recovery instead of Fan Home", async () => {
    await expect(FanOnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });
});
