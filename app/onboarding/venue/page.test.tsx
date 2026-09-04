// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Page from "./page";
import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
vi.mock("@/features/workspaces/actions", () => ({
  activateVenueOnboardingAction: vi.fn(),
  acceptCommonOnboardingAction: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "account-a", email_confirmed_at: "2026-01-01" } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            error: null,
            data: {
              adult_attested_at: "2026-01-01",
              rules_version: CURRENT_COMMUNITY_RULES_VERSION,
              rules_accepted_at: "2026-01-01",
              suspended_at: null,
              community_restricted_at: null,
            },
          }),
        }),
      }),
    }),
  }),
}));
it("explains Billing as the next step without promising immediate public availability", async () => {
  render(await Page());
  expect(screen.getAllByText(/choose a demo plan in billing/i).length).toBeGreaterThan(0);
  expect(screen.queryByText(/immediately usable/i)).not.toBeInTheDocument();
});
