import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createVenueAction, setVenueFollowAction, updateVenueAction } from "./actions";

const venueId = "61000000-0000-4000-8000-000000000301";

function venueForm(includeId: boolean) {
  const form = new FormData();
  if (includeId) form.set("venueId", venueId);
  form.set("name", "Match Corner");
  form.set("slug", "match-corner");
  form.set("addressText", "12 Stadium Street, Haifa");
  form.set("longitude", "34.998");
  form.set("latitude", "32.812");
  form.set("description", "A welcoming venue for watching the full match together.");
  form.set("screenCount", "4");
  form.set("statedCapacity", "120");
  form.set("mainSpaceName", "Main screen");
  form.set("mainSpaceCapacity", "120");
  form.set("defaultAttendanceMode", "reservations");
  form.set("houseInformation", "Order at the bar before kick-off.");
  form.set("defaultRequiresApproval", "on");
  form.set("adultAttested", "on");
  form.set("representationAttested", "on");
  form.set("rulesAccepted", "on");
  form.set("rulesVersion", "1");
  return form;
}

describe("venue authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("61000000-0000-4000-8000-000000000399");
  });

  it("uses authenticated onboarding plus explicit attestations for a new Venue workspace", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ venue_id: venueId, slug: "match-corner", verification_status: "unverified" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await createVenueAction(null, venueForm(false));

    expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    expect(rpc).toHaveBeenCalledWith(
      "create_venue_workspace_v2",
      expect.objectContaining({
        input_main_space_name: "Main screen",
        input_main_space_capacity: 120,
        input_adult_attested: true,
        input_representation_attested: true,
        input_rules_version: 1,
      }),
    );
  });

  it("authorizes an update against the concrete Venue ID", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ venue_id: venueId, slug: "match-corner", verification_status: "unverified" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await updateVenueAction(null, venueForm(true));

    expect(mocks.requireActor).toHaveBeenCalledWith({ venueId });
  });

  it("requires an active Fan identity to follow a Venue", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.requireActor.mockResolvedValue({
      supabase: { rpc },
      user: { id: "61000000-0000-4000-8000-000000000303" },
    });
    const form = new FormData();
    form.set("venueId", venueId);
    form.set("venueSlug", "match-corner");
    form.set("intent", "follow");

    const result = await setVenueFollowAction(null, form);

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(result?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("follow_venue", {
      input_venue_id: venueId,
      audit_request_id: "61000000-0000-4000-8000-000000000399",
    });
  });

  it("returns neutral unavailable errors when a venue hides before follow commits", async () => {
    mocks.requireActor.mockResolvedValue({
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "NOT_ALLOWED" } }),
      },
      user: { id: "61000000-0000-4000-8000-000000000303" },
    });
    const form = new FormData();
    form.set("venueId", venueId);
    form.set("venueSlug", "match-corner");
    form.set("intent", "follow");
    const result = await setVenueFollowAction(null, form);
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(JSON.stringify(result)).not.toMatch(/billing|payment|polar|grace/i);
  });
});
