import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createGroupAction } from "./actions";

const cityId = "50000000-0000-4000-8000-000000000101";
const teamId = "50000000-0000-4000-8000-000000000201";
const groupId = "50000000-0000-4000-8000-000000000301";

function groupForm(intent: "check" | "create") {
  const formData = new FormData();
  formData.set("intent", intent);
  formData.set("name", "Haifa Arsenal Supporters");
  formData.set("slug", "haifa-arsenal-supporters");
  formData.set("cityId", cityId);
  formData.set("teamId", teamId);
  formData.set("visibility", "discoverable");
  formData.set("description", "Match-going supporters in Haifa.");
  return formData;
}

describe("createGroupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("10000000-0000-4000-8000-000000000099");
  });

  it("requires valid bounded input before actor or database access", async () => {
    const formData = groupForm("check");
    formData.set("visibility", "public");

    const result = await createGroupAction(null, formData);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("returns only bounded discoverable similarity suggestions", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          group_id: groupId,
          slug: "haifa-arsenal-fans",
          name: "Haifa Arsenal Fans",
          lifecycle: "active",
          city_name: "Haifa",
          team_name: "Arsenal FC",
          similarity_score: 0.8,
        },
      ],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await createGroupAction(null, groupForm("check"));

    expect(rpc).toHaveBeenCalledWith("suggest_similar_groups", {
      input_name: "Haifa Arsenal Supporters",
      input_city_id: cityId,
      input_team_id: teamId,
      input_limit: 5,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { phase: "review", suggestions: [{ slug: "haifa-arsenal-fans" }] },
    });
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("refuses creation until the exact form values were reviewed", async () => {
    const rpc = vi.fn();
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await createGroupAction(null, groupForm("create"));

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates the reviewed group through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ group_id: groupId, slug: "haifa-arsenal-supporters", lifecycle: "forming" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const reviewState = {
      ok: true as const,
      data: {
        phase: "review" as const,
        message: "No similar discoverable groups found.",
        values: {
          name: "Haifa Arsenal Supporters",
          slug: "haifa-arsenal-supporters",
          cityId,
          teamId,
          visibility: "discoverable" as const,
          description: "Match-going supporters in Haifa.",
        },
        suggestions: [],
      },
    };

    const result = await createGroupAction(reviewState, groupForm("create"));

    expect(rpc).toHaveBeenCalledWith("create_group", {
      input_name: "Haifa Arsenal Supporters",
      input_slug: "haifa-arsenal-supporters",
      input_city_id: cityId,
      input_team_id: teamId,
      input_visibility: "discoverable",
      input_description: "Match-going supporters in Haifa.",
      audit_request_id: "10000000-0000-4000-8000-000000000099",
    });
    expect(result).toMatchObject({ ok: true, data: { phase: "created", group: { id: groupId } } });
  });
});
