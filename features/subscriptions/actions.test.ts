import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { setSubscriptionPreferenceAction } from "./actions";

const userId = "10000000-0000-4000-8000-000000000099";
const targetId = "10000000-0000-4000-8000-000000000001";

function preferenceForm(kind = "team", intent = "follow", selectedTargetId = targetId): FormData {
  const form = new FormData();
  form.set("kind", kind);
  form.set("intent", intent);
  form.set("targetId", selectedTargetId);
  return form;
}

describe("setSubscriptionPreferenceAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects crafted input before authentication or database access", async () => {
    const result = await setSubscriptionPreferenceAction(null, preferenceForm("player", "toggle"));

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("derives the actor and inserts exactly one matching target column", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    mocks.requireActor.mockResolvedValue({ supabase: { from }, user: { id: userId } });

    const result = await setSubscriptionPreferenceAction(null, preferenceForm());

    expect(mocks.requireActor).toHaveBeenCalledWith("community");
    expect(from).toHaveBeenCalledWith("subscriptions");
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      kind: "team",
      sport_id: null,
      competition_id: null,
      team_id: targetId,
    });
    expect(result).toEqual({
      ok: true,
      data: { message: "Follow added.", intent: "follow", kind: "team", targetId },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/interests");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/matches", "layout");
  });

  it("treats a duplicate follow as an idempotent success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "23505", details: "uidx" } });
    mocks.requireActor.mockResolvedValue({
      supabase: { from: vi.fn().mockReturnValue({ insert }) },
      user: { id: userId },
    });

    const result = await setSubscriptionPreferenceAction(null, preferenceForm());

    expect(result).toEqual({
      ok: true,
      data: {
        message: "You already follow this.",
        intent: "follow",
        kind: "team",
        targetId,
      },
    });
  });

  it("deletes only the actor's selected follow and remains idempotent", async () => {
    const match = vi.fn().mockResolvedValue({ error: null });
    const deleteRows = vi.fn().mockReturnValue({ match });
    mocks.requireActor.mockResolvedValue({
      supabase: { from: vi.fn().mockReturnValue({ delete: deleteRows }) },
      user: { id: userId },
    });

    const result = await setSubscriptionPreferenceAction(
      null,
      preferenceForm("competition", "unfollow"),
    );

    expect(match).toHaveBeenCalledWith({
      user_id: userId,
      kind: "competition",
      competition_id: targetId,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message: "Follow removed.",
        intent: "unfollow",
        kind: "competition",
        targetId,
      },
    });
  });

  it("returns the stable actor denial without exposing database details", async () => {
    mocks.requireActor.mockRejectedValue(new DomainError("AUTH_REQUIRED"));

    const result = await setSubscriptionPreferenceAction(null, preferenceForm());

    expect(result).toEqual({
      ok: false,
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
    });
  });

  it("maps a forged or inactive target to a safe denial", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: "42501", message: "policy name and SQL details" },
    });
    mocks.requireActor.mockResolvedValue({
      supabase: { from: vi.fn().mockReturnValue({ insert }) },
      user: { id: userId },
    });

    const result = await setSubscriptionPreferenceAction(null, preferenceForm());

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_ALLOWED", message: "You cannot perform that action." },
    });
    expect(JSON.stringify(result)).not.toContain("policy name");
  });
});
