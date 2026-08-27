import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { savePrivateEventAction } from "./actions";

const matchId = "60000000-0000-4000-8000-000000000101";
const cityId = "60000000-0000-4000-8000-000000000102";
const eventId = "60000000-0000-4000-8000-000000000103";

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
    rpc.mockResolvedValue({ data: [{ event_id: eventId, status: "published" }], error: null });
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
});
