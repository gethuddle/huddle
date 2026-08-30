import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";

import {
  createVenueWorkspaceAction,
  planVenueEventsAction,
  saveVenueSpaceAction,
  updateVenueSettingsAction,
  updateVenueWorkspaceAction,
} from "./actions";

const venueId = "d3000000-0000-4000-8000-000000000301";
const cityId = "d3000000-0000-4000-8000-000000000302";
const requestId = "d3000000-0000-4000-8000-000000000399";

function activationForm() {
  const form = new FormData();
  form.set("name", "Match Corner");
  form.set("slug", "match-corner");
  form.set("cityId", cityId);
  form.set("addressText", "12 Stadium Street, Haifa");
  form.set("longitude", "34.998");
  form.set("latitude", "32.812");
  form.set("description", "A welcoming venue for watching the full match together.");
  form.set("mainSpaceName", "Main screen");
  form.set("mainSpaceCapacity", "120");
  form.set("defaultAttendanceMode", "reservations");
  form.append("facilities", "wheelchair_accessible");
  form.append("facilities", "food");
  form.set("houseInformation", "Order at the bar before kick-off.");
  form.set("defaultRequiresApproval", "on");
  form.set("adultAttested", "on");
  form.set("representationAttested", "on");
  form.set("rulesAccepted", "on");
  form.set("rulesVersion", String(CURRENT_COMMUNITY_RULES_VERSION));
  return form;
}

describe("Venue workspace actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue(requestId);
  });

  it("sends the exact activation attestations and defaults to the controlled RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ venue_id: venueId, slug: "match-corner", verification_status: "unverified" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await expect(createVenueWorkspaceAction(null, activationForm())).resolves.toMatchObject({
      ok: true,
      data: { venue: { id: venueId, verificationStatus: "unverified" } },
    });

    expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    expect(rpc).toHaveBeenCalledWith("create_venue_workspace_v2", {
      input_name: "Match Corner",
      input_slug: "match-corner",
      input_city_id: cityId,
      input_address_text: "12 Stadium Street, Haifa",
      input_longitude: 34.998,
      input_latitude: 32.812,
      input_description: "A welcoming venue for watching the full match together.",
      input_main_space_name: "Main screen",
      input_main_space_capacity: 120,
      input_default_attendance_mode: "reservations",
      input_facilities: ["wheelchair_accessible", "food"],
      input_house_information: "Order at the bar before kick-off.",
      input_default_requires_approval: true,
      input_adult_attested: true,
      input_representation_attested: true,
      input_rules_version: CURRENT_COMMUNITY_RULES_VERSION,
      audit_request_id: requestId,
    });
  });

  it("does not infer acceptance when the representation checkbox is absent", async () => {
    const form = activationForm();
    form.delete("representationAttested");

    const result = await createVenueWorkspaceAction(null, form);

    expect(result).toMatchObject({ ok: false });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("authorizes profile and area writes against the concrete Venue ID", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ venue_id: venueId, slug: "match-corner", verification_status: "unverified" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            space_id: "d3000000-0000-4000-8000-000000000303",
            name: "Terrace screen",
            capacity: 45,
            active: true,
          },
        ],
        error: null,
      });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const update = activationForm();
    update.set("venueId", venueId);
    const space = new FormData();
    space.set("venueId", venueId);
    space.set("name", "Terrace screen");
    space.set("capacity", "45");
    space.set("active", "on");
    space.set("sortOrder", "2");

    await updateVenueWorkspaceAction(null, update);
    await saveVenueSpaceAction(null, space);

    expect(mocks.requireActor).toHaveBeenNthCalledWith(1, { venueId });
    expect(mocks.requireActor).toHaveBeenNthCalledWith(2, { venueId });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "save_venue_space",
      expect.objectContaining({ input_venue_id: venueId, input_space_id: null }),
    );
  });

  it("submits one bounded planner array through the all-or-none RPC", async () => {
    const matchId = "d3000000-0000-4000-8000-000000000304";
    const spaceId = "d3000000-0000-4000-8000-000000000303";
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          event_id: "d3000000-0000-4000-8000-000000000305",
          status: "published",
        },
      ],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await expect(
      planVenueEventsAction({
        venueId,
        venueSlug: "match-corner",
        intent: "publish",
        items: [
          {
            matchId,
            venueSpaceId: spaceId,
            attendanceMode: "reservations",
            title: null,
            description: null,
            capacity: null,
            requiresApproval: null,
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: true, data: { createdCount: 1 } });

    expect(mocks.requireActor).toHaveBeenCalledWith({ venueId });
    expect(rpc).toHaveBeenCalledWith("plan_venue_events", {
      input_items: [
        {
          matchId,
          venueSpaceId: spaceId,
          attendanceMode: "reservations",
          title: null,
          description: null,
          capacity: null,
          requiresApproval: null,
        },
      ],
      input_intent: "publish",
      audit_request_id: requestId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/venues/match-corner/workspace", "layout");
  });

  it("keeps existing address coordinates server-side when settings change without a new pin", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            venue_id: venueId,
            slug: "match-corner",
            name: "Match Corner",
            role: "owner",
            verification_status: "unverified",
            city_id: cityId,
            city_name: "Haifa",
            address_text: "12 Stadium Street, Haifa",
            longitude: 34.998,
            latitude: 32.812,
            description: "A welcoming venue for watching the full match together.",
            facilities: ["food"],
            house_information: "Order at the bar before kick-off.",
            default_attendance_mode: "reservations",
            default_requires_approval: true,
            spaces: [],
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ venue_id: venueId, slug: "match-corner", verification_status: "unverified" }],
        error: null,
      });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await expect(
      updateVenueSettingsAction({
        venueId,
        name: "Match Corner",
        slug: "match-corner",
        cityId,
        description: "A refreshed welcoming venue for watching the full match together.",
        facilities: ["food"],
        houseInformation: "Order at the bar before kick-off.",
        defaultAttendanceMode: "reservations",
        defaultRequiresApproval: true,
        address: null,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(rpc).toHaveBeenNthCalledWith(2, "update_venue_workspace_v2", {
      input_venue_id: venueId,
      input_name: "Match Corner",
      input_slug: "match-corner",
      input_city_id: cityId,
      input_address_text: "12 Stadium Street, Haifa",
      input_longitude: 34.998,
      input_latitude: 32.812,
      input_description: "A refreshed welcoming venue for watching the full match together.",
      input_facilities: ["food"],
      input_house_information: "Order at the bar before kick-off.",
      input_default_attendance_mode: "reservations",
      input_default_requires_approval: true,
      audit_request_id: requestId,
    });
  });
});
