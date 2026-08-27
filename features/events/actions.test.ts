import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { savePrivateEventAction, saveVenueEventAction } from "./actions";

const matchId = "60000000-0000-4000-8000-000000000101";
const cityId = "60000000-0000-4000-8000-000000000102";
const eventId = "60000000-0000-4000-8000-000000000103";
const groupId = "60000000-0000-4000-8000-000000000104";
const venueId = "60000000-0000-4000-8000-000000000105";
const teamId = "60000000-0000-4000-8000-000000000106";

function homeEventForm() {
  const formData = new FormData();
  formData.set("matchId", matchId);
  formData.set("title", "Arsenal at Guy's");
  formData.set("description", "A calm home watch party for the full match.");
  formData.set("expectedActivity", "Watch the full match together");
  formData.set("costDescription", "Free");
  formData.set("eventRules", "Respect the host and every attendee.");
  formData.set("commercialAffiliation", "None");
  formData.set("hostPresenceConfirmed", "on");
  formData.set("cityId", cityId);
  formData.set("placeKind", "home");
  formData.set("privateAddressText", "12 Private Street, Haifa");
  formData.set("privateDirections", "Ring apartment 4.");
  formData.set("privateLongitude", "34.99928");
  formData.set("privateLatitude", "32.81303");
  formData.set("audience", "invite_only");
  formData.set("capacity", "6");
  formData.set("intent", "publish");
  return formData;
}

function venueEventForm() {
  const formData = new FormData();
  formData.set("venueId", venueId);
  formData.set("venueSlug", "match-corner");
  formData.set("matchId", matchId);
  formData.set("title", "Arsenal at Match Corner");
  formData.set("description", "A venue-hosted public watch event for the full match.");
  formData.set("expectedActivity", "Watch the full match together");
  formData.set("costDescription", "No cover charge");
  formData.set("eventRules", "Respect venue staff and every attendee.");
  formData.set("commercialAffiliation", "Hosted commercially by Match Corner");
  formData.set("hostPresenceConfirmed", "on");
  formData.set("audience", "public");
  formData.set("capacity", "80");
  formData.set("intent", "publish");
  return formData;
}

describe("savePrivateEventAction", () => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("60000000-0000-4000-8000-000000000199");
    mocks.requireActor.mockResolvedValue({ supabase: { from, rpc } });
    maybeSingle.mockResolvedValue({ data: { starts_at: "2026-09-01T17:00:00Z" }, error: null });
    rpc.mockImplementation((name: string) => {
      if (name === "get_venue_for_management") {
        return Promise.resolve({
          data: [
            {
              venue_id: venueId,
              city_id: cityId,
              verification_status: "unverified",
              suspended_at: null,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [{ event_id: eventId, status: "published" }], error: null });
    });
  });

  it("rejects crafted personal-public audience before database access", async () => {
    const formData = homeEventForm();
    formData.set("audience", "public");

    const result = await savePrivateEventAction(null, formData);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("never echoes protected home details in a failure result", async () => {
    const formData = homeEventForm();
    formData.set("capacity", "13");

    const result = await savePrivateEventAction(null, formData);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      values: {
        privateAddressText: "",
        privateDirections: "",
        privateLongitude: "",
        privateLatitude: "",
      },
    });
    expect(serialized).not.toContain("Private Street");
    expect(serialized).not.toContain("Ring apartment");
    expect(serialized).not.toContain("34.99928");
    expect(serialized).not.toContain("32.81303");
  });

  it("derives the time window and sends exact home details only to the controlled transaction", async () => {
    const result = await savePrivateEventAction(null, homeEventForm());

    expect(rpc).toHaveBeenCalledWith(
      "create_or_update_event",
      expect.objectContaining({
        input_host_venue_id: null,
        input_match_id: matchId,
        input_starts_at: "2026-09-01T17:00:00.000Z",
        input_ends_at: "2026-09-01T20:00:00.000Z",
        input_place_kind: "home",
        input_private_address_text: "12 Private Street, Haifa",
        input_public_address_text: null,
        input_audience: "invite_only",
        input_capacity: 6,
        input_requires_approval: true,
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        message: "Private event published to its eligible audience.",
        event: { id: eventId, status: "published" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("Private Street");
  });

  it("submits to a separately selected organizer without changing the private audience", async () => {
    const formData = homeEventForm();
    formData.set("organizingGroupId", groupId);
    rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data: [
          {
            event_id: eventId,
            status: name === "create_group_event" ? "pending_group_review" : "published",
          },
        ],
        error: null,
      }),
    );

    const result = await savePrivateEventAction(null, formData);

    expect(rpc).toHaveBeenCalledWith(
      "create_group_event",
      expect.objectContaining({
        input_organizing_group_id: groupId,
        input_audience: "invite_only",
        input_audience_group_id: null,
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith("create_or_update_event", expect.anything());
    expect(result).toMatchObject({
      ok: true,
      data: { event: { status: "pending_group_review" } },
    });
  });
});

describe("saveVenueEventAction", () => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("60000000-0000-4000-8000-000000000199");
    mocks.requireActor.mockResolvedValue({ supabase: { from, rpc } });
    maybeSingle.mockResolvedValue({ data: { starts_at: "2026-09-01T17:00:00Z" }, error: null });
    rpc.mockImplementation((name: string) => {
      if (name === "get_venue_for_management") {
        return Promise.resolve({
          data: [
            {
              venue_id: venueId,
              city_id: cityId,
              verification_status: "unverified",
              suspended_at: null,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [{ event_id: eventId, status: "published" }], error: null });
    });
  });

  it("rejects private venue audiences and a missing team target before actor access", async () => {
    const privateAudience = venueEventForm();
    privateAudience.set("audience", "friends");
    expect(await saveVenueEventAction(null, privateAudience)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });

    const missingTeam = venueEventForm();
    missingTeam.set("audience", "team_followers");
    expect(await saveVenueEventAction(null, missingTeam)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("derives venue identity, city, and time while defaulting to immediate approval", async () => {
    const result = await saveVenueEventAction(null, venueEventForm());

    expect(rpc).toHaveBeenCalledWith(
      "create_or_update_event",
      expect.objectContaining({
        input_host_venue_id: venueId,
        input_venue_id: venueId,
        input_city_id: cityId,
        input_starts_at: "2026-09-01T17:00:00.000Z",
        input_ends_at: "2026-09-01T20:00:00.000Z",
        input_place_kind: "venue",
        input_audience: "public",
        input_requires_approval: false,
        input_public_address_text: null,
        input_private_address_text: null,
      }),
    );
    expect(result).toMatchObject({ ok: true, data: { event: { status: "published" } } });
  });

  it("passes the selected team only for a team-follower listing", async () => {
    const formData = venueEventForm();
    formData.set("audience", "team_followers");
    formData.set("audienceTeamId", teamId);

    await saveVenueEventAction(null, formData);

    expect(rpc).toHaveBeenCalledWith(
      "create_or_update_event",
      expect.objectContaining({
        input_audience: "team_followers",
        input_audience_team_id: teamId,
      }),
    );
  });
});
