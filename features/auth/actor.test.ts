import { describe, expect, it, vi } from "vitest";

import { actorGateCode, requireActor, type ActorFacts } from "./actor";

const completeFacts: ActorFacts = {
  authenticated: true,
  emailVerified: true,
  profileExists: true,
  adultAttested: true,
  rulesCurrent: true,
  profileComplete: true,
  fanEnabled: true,
  suspended: false,
  restricted: false,
  venueAuthorized: true,
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
  ] as const)("returns %s for an ineligible common actor", (facts, expected) => {
    expect(actorGateCode(facts, "common")).toBe(expected);
  });

  it.each([
    [{ ...completeFacts, profileComplete: false }, "PROFILE_INCOMPLETE"],
    [{ ...completeFacts, fanEnabled: false }, "PROFILE_INCOMPLETE"],
  ] as const)("returns %s for an ineligible Fan actor", (facts, expected) => {
    expect(actorGateCode(facts, "fan")).toBe(expected);
  });

  it("fails closed when Fan activation is undefined at an unsafe runtime boundary", () => {
    const factsWithoutFanActivation = { ...completeFacts, fanEnabled: undefined };

    expect(actorGateCode(factsWithoutFanActivation as unknown as ActorFacts, "fan")).toBe(
      "PROFILE_INCOMPLETE",
    );
  });

  it("requires every normal ActorFacts value to include Fan activation", () => {
    const factsWithRequiredFanActivation: { fanEnabled: boolean } = completeFacts;

    expect(factsWithRequiredFanActivation.fanEnabled).toBe(true);
  });

  it("allows an authenticated actor to continue incomplete verification and onboarding", () => {
    expect(
      actorGateCode(
        {
          ...completeFacts,
          emailVerified: false,
          profileExists: false,
          adultAttested: false,
          rulesCurrent: false,
          profileComplete: false,
          fanEnabled: false,
        },
        "authenticated",
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
          fanEnabled: false,
        },
        "safety",
      ),
    ).toBeNull();
  });

  it("requires active membership for the concrete Venue in context", () => {
    expect(
      actorGateCode(
        { ...completeFacts, venueAuthorized: false },
        { venueId: "20000000-0000-4000-8000-000000000001" },
      ),
    ).toBe("NOT_ALLOWED");
    expect(
      actorGateCode(completeFacts, {
        venueId: "20000000-0000-4000-8000-000000000001",
      }),
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
      fan_enabled_at: "2026-08-30T00:00:00Z",
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

    const actor = await requireActor("fan", async () => client as never);

    expect(actor.profile.handle).toBe("fan_one");
    expect(actor.supabase).toBe(client);
  });

  it("rejects a missing session before profile authorization", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };

    await expect(requireActor("authenticated", async () => client as never)).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("authorizes a concrete Venue only through the actor own active membership", async () => {
    const profile = {
      id: "10000000-0000-4000-8000-000000000001",
      handle: null,
      display_name: null,
      city_id: null,
      adult_attested_at: "2026-08-25T00:00:00Z",
      rules_version: 1,
      rules_accepted_at: "2026-08-25T00:00:00Z",
      profile_completed_at: null,
      fan_enabled_at: null,
      suspended_at: null,
      suspension_expires_at: null,
      community_restricted_at: null,
      community_restricted_until: null,
    };
    const profileMaybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          workspace_kind: "venue",
          workspace_id: "20000000-0000-4000-8000-000000000001",
          slug: "match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ],
      error: null,
    });
    const from = vi.fn((relation: string) => {
      if (relation === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: profileMaybeSingle })),
          })),
        };
      }
      throw new Error(`Unexpected relation ${relation}`);
    });
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
      from,
      rpc,
    };

    await expect(
      requireActor(
        { venueId: "20000000-0000-4000-8000-000000000001" },
        async () => client as never,
      ),
    ).resolves.toMatchObject({ profile });
    expect(rpc).toHaveBeenCalledWith("list_my_workspaces");
  });
});
