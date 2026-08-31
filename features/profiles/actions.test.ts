import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { activateFanOnboardingAction, activateFanWorkspaceAction } from "./actions";

function validFormData() {
  const formData = new FormData();
  formData.set("handle", "Fan_One");
  formData.set("displayName", "Fan One");
  formData.set("bio", "Football and friends.");
  formData.set("adultAttested", "on");
  formData.set("rulesAccepted", "on");
  formData.set("rulesVersion", "1");
  return formData;
}

describe("activateFanWorkspaceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet });
  });

  it("rejects missing confirmations before opening a database boundary", async () => {
    const formData = validFormData();
    formData.delete("adultAttested");

    const result = await activateFanWorkspaceAction(null, formData);

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

    const result = await activateFanWorkspaceAction(null, validFormData());

    expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    expect(rpc).toHaveBeenCalledWith("activate_fan_workspace", {
      input_handle: "fan_one",
      input_display_name: "Fan One",
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
    expect(rpc).toHaveBeenCalledOnce();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("uses the database-confirmed handle for the settings destination", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ handle: "fan_one", profile_completed_at: "2026-08-25T00:00:00Z" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const formData = validFormData();
    formData.set("handle", "  Fan_One  ");

    const result = await activateFanWorkspaceAction(null, formData);

    expect(result).toMatchObject({
      ok: true,
      data: { redirectTo: "/people/fan_one" },
    });
  });

  it("lands completed onboarding in Fan Home", async () => {
    const userId = "e4000000-0000-4000-8000-000000000101";
    const rpc = vi.fn().mockImplementation(async (name: string) =>
      name === "activate_fan_workspace"
        ? {
            data: [{ handle: "fan_one", profile_completed_at: "2026-08-25T00:00:00Z" }],
            error: null,
          }
        : {
            data: [
              {
                workspace_kind: "fan",
                workspace_id: userId,
                slug: "fan_one",
                name: "Fan One",
                role: "fan",
              },
            ],
            error: null,
          },
    );
    mocks.requireActor.mockResolvedValue({ supabase: { rpc }, user: { id: userId } });

    const result = await activateFanOnboardingAction(null, validFormData());

    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/" } });
    expect(rpc).toHaveBeenNthCalledWith(2, "list_my_workspaces");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      `fan:${userId}`,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  it("maps reviewed database failures without exposing SQL detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "HANDLE_UNAVAILABLE", details: "profiles_handle_lower_uidx" },
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await activateFanWorkspaceAction(null, validFormData());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HANDLE_UNAVAILABLE", message: "Choose another handle." },
      values: {
        handle: "Fan_One",
        displayName: "Fan One",
      },
    });
    expect(JSON.stringify(result)).not.toContain("profiles_handle_lower_uidx");
  });
});
