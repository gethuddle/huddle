import { describe, expect, it, vi } from "vitest";

import { actorGateCode, requireActor, type ActorFacts } from "./actor";

const completeFacts: ActorFacts = {
  authenticated: true,
  emailVerified: true,
  profileExists: true,
  adultAttested: true,
  rulesCurrent: true,
  profileComplete: true,
  suspended: false,
  restricted: false,
};

describe("actorGateCode", () => {
  it.each([
    [{ ...completeFacts, authenticated: false }, "AUTH_REQUIRED"],
    [{ ...completeFacts, emailVerified: false }, "EMAIL_NOT_VERIFIED"],
    [{ ...completeFacts, profileExists: false }, "PROFILE_INCOMPLETE"],
    [{ ...completeFacts, suspended: true }, "ACCOUNT_SUSPENDED"],
    [{ ...completeFacts, restricted: true }, "ACCOUNT_RESTRICTED"],
    [{ ...completeFacts, adultAttested: false }, "ADULT_ATTESTATION_REQUIRED"],
    [{ ...completeFacts, rulesCurrent: false }, "RULES_ACCEPTANCE_REQUIRED"],
    [{ ...completeFacts, profileComplete: false }, "PROFILE_INCOMPLETE"],
  ] as const)("returns %s for an ineligible community actor", (facts, expected) => {
    expect(actorGateCode(facts, "community")).toBe(expected);
  });

  it("allows an incomplete verified actor through the onboarding gate", () => {
    expect(
      actorGateCode(
        {
          ...completeFacts,
          adultAttested: false,
          rulesCurrent: false,
          profileComplete: false,
        },
        "onboarding",
      ),
    ).toBeNull();
  });

  it("keeps reporting and appeals available to suspended or restricted actors", () => {
    expect(
      actorGateCode({ ...completeFacts, suspended: true, restricted: true }, "safety"),
    ).toBeNull();
  });

  it("keeps verified safety access when onboarding or current-rules facts are incomplete", () => {
    expect(
      actorGateCode(
        {
          ...completeFacts,
          adultAttested: false,
          rulesCurrent: false,
          profileComplete: false,
        },
        "safety",
      ),
    ).toBeNull();
  });
});

describe("requireActor", () => {
  it("returns the request-scoped client, user, and eligible profile", async () => {
    const profile = {
      id: "10000000-0000-4000-8000-000000000001",
      handle: "fan_one",
      display_name: "Fan One",
      city_id: "00000000-0000-4000-8000-000000000003",
      adult_attested_at: "2026-08-25T00:00:00Z",
      rules_version: 1,
      rules_accepted_at: "2026-08-25T00:00:00Z",
      profile_completed_at: "2026-08-25T00:00:00Z",
      suspended_at: null,
      suspension_expires_at: null,
      community_restricted_at: null,
      community_restricted_until: null,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: profile.id,
              email_confirmed_at: "2026-08-25T00:00:00Z",
            },
          },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    };

    const actor = await requireActor("community", async () => client as never);

    expect(actor.profile.handle).toBe("fan_one");
    expect(actor.supabase).toBe(client);
  });

  it("rejects a missing session before profile authorization", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };

    await expect(requireActor("onboarding", async () => client as never)).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });
});
