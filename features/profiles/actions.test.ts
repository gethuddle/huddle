import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { saveProfileAction } from "./actions";

function validFormData() {
  const formData = new FormData();
  formData.set("handle", "Fan_One");
  formData.set("displayName", "Fan One");
  formData.set("citySlug", "haifa");
  formData.set("bio", "Football and friends.");
  formData.set("adultAttested", "on");
  formData.set("rulesAccepted", "on");
  formData.set("rulesVersion", "1");
  return formData;
}

describe("saveProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing confirmations before opening a database boundary", async () => {
    const formData = validFormData();
    formData.delete("adultAttested");

    const result = await saveProfileAction(null, formData);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("normalizes input and completes the profile through the controlled RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ handle: "fan_one", profile_completed_at: "2026-08-25T00:00:00Z" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await saveProfileAction(null, validFormData());

    expect(rpc).toHaveBeenCalledWith("complete_profile", {
      input_handle: "fan_one",
      input_display_name: "Fan One",
      input_city_slug: "haifa",
      input_bio: "Football and friends.",
      input_adult_attested: true,
      input_rules_version: 1,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message: "Your Huddle profile is ready.",
        redirectTo: "/people/fan_one",
      },
    });
  });

  it("maps reviewed database failures without exposing SQL detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "HANDLE_UNAVAILABLE", details: "profiles_handle_lower_uidx" },
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await saveProfileAction(null, validFormData());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HANDLE_UNAVAILABLE", message: "Choose another handle." },
      values: {
        handle: "Fan_One",
        displayName: "Fan One",
        citySlug: "haifa",
      },
    });
    expect(JSON.stringify(result)).not.toContain("profiles_handle_lower_uidx");
  });
});
