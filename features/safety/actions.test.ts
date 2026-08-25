import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { setBlockPreferenceAction } from "./actions";

function preferenceForm(targetHandle = "Fan_One", intent = "block") {
  const formData = new FormData();
  formData.set("targetHandle", targetHandle);
  formData.set("intent", intent);
  return formData;
}

describe("setBlockPreferenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("10000000-0000-4000-8000-000000000099");
  });

  it("rejects crafted input before authentication or database access", async () => {
    const result = await setBlockPreferenceAction(null, preferenceForm("x", "erase"));

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it.each(["block", "unblock"] as const)(
    "uses the complete-actor gate and controlled %s RPC",
    async (intent) => {
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

      const result = await setBlockPreferenceAction(null, preferenceForm("Fan_One", intent));

      expect(mocks.requireActor).toHaveBeenCalledWith("community");
      expect(rpc).toHaveBeenCalledWith(`${intent}_user`, {
        target_handle: "fan_one",
        audit_request_id: "10000000-0000-4000-8000-000000000099",
      });
      expect(result).toEqual({
        ok: true,
        data: {
          message: "Safety preference updated.",
          intent,
          targetHandle: "fan_one",
        },
      });
    },
  );

  it("does not expose database detail in a failed mutation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "duplicate key", details: "user_blocks_pkey" },
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await setBlockPreferenceAction(null, preferenceForm());

    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." },
    });
    expect(JSON.stringify(result)).not.toContain("user_blocks_pkey");
  });
});
