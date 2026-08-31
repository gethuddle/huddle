import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { discardEventDraft, finalizeEventDraft, getEventDraft, saveEventDraft } from "./drafts";

const draftId = "66000000-0000-4000-8000-000000000101";
const groupId = "66000000-0000-4000-8000-000000000102";
const matchId = "66000000-0000-4000-8000-000000000103";
const eventId = "66000000-0000-4000-8000-000000000105";

function draftRow() {
  return {
    draft_id: draftId,
    step: 2,
    draft_values: {
      matchId,
      title: "Protected Fan draft",
      placeKind: "home",
      audience: "group",
      audienceGroupId: groupId,
      capacity: 6,
    },
    organizing_group_id: groupId,
    private_address_text: "17 Protected Lane, Haifa",
    private_directions_text: "Ring apartment 4 only after approval.",
    private_longitude: 34.998,
    private_latitude: 32.812,
    updated_at: "2026-08-30T12:00:00.000Z",
  };
}

describe("event draft adapter", () => {
  const rpc = vi.fn();
  const client = { rpc } as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends only canonical safe JSON while protected values use separate RPC arguments", async () => {
    rpc.mockResolvedValue({ data: [draftRow()], error: null });

    const result = await saveEventDraft(client, {
      id: null,
      step: 2,
      values: {
        matchId,
        title: "Protected Fan draft",
        placeKind: "home",
        audience: "group",
        audienceGroupId: groupId,
        capacity: 6,
      },
      organizingGroupId: groupId,
      privateLocation: {
        mode: "replace",
        value: {
          addressText: "17 Protected Lane, Haifa",
          directionsText: "Ring apartment 4 only after approval.",
          longitude: 34.998,
          latitude: 32.812,
        },
      },
    });

    expect(rpc).toHaveBeenCalledWith("save_event_draft", {
      input_draft_id: null,
      input_step: 2,
      input_values: {
        matchId,
        title: "Protected Fan draft",
        placeKind: "home",
        audience: "group",
        audienceGroupId: groupId,
        capacity: 6,
      },
      input_organizing_group_id: groupId,
      input_private_mode: "replace",
      input_private_address_text: "17 Protected Lane, Haifa",
      input_private_directions_text: "Ring apartment 4 only after approval.",
      input_private_longitude: 34.998,
      input_private_latitude: 32.812,
    });
    expect(result).toEqual({
      draft: {
        id: draftId,
        step: 2,
        values: draftRow().draft_values,
        savedAt: "2026-08-30T12:00:00.000Z",
      },
      organizingGroupId: groupId,
      protectedLocation: {
        addressText: "17 Protected Lane, Haifa",
        directionsText: "Ring apartment 4 only after approval.",
        longitude: 34.998,
        latitude: 32.812,
      },
    });
    expect(JSON.stringify(rpc.mock.calls[0]?.[1].input_values)).not.toContain("Protected Lane");
  });

  it("fails closed when the database projection adds an unreviewed field", async () => {
    rpc.mockResolvedValue({
      data: [{ ...draftRow(), owner_email: "private@example.com" }],
      error: null,
    });

    await expect(getEventDraft(client, draftId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("fails closed when the database returns a non-ISO save timestamp", async () => {
    rpc.mockResolvedValue({
      data: [{ ...draftRow(), updated_at: "yesterday" }],
      error: null,
    });

    await expect(getEventDraft(client, draftId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("fails closed when protected columns are only partially populated", async () => {
    rpc.mockResolvedValue({
      data: [{ ...draftRow(), private_latitude: null }],
      error: null,
    });

    await expect(getEventDraft(client, draftId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it.each([
    ["an address shorter than five characters", { private_address_text: "1234" }],
    ["an address longer than 300 characters", { private_address_text: "a".repeat(301) }],
    ["empty directions", { private_directions_text: "" }],
    ["directions longer than 500 characters", { private_directions_text: "d".repeat(501) }],
    ["longitude west of Israel", { private_longitude: 33.999 }],
    ["longitude east of Israel", { private_longitude: 36.001 }],
    ["latitude south of Israel", { private_latitude: 28.999 }],
    ["latitude north of Israel", { private_latitude: 34.001 }],
  ])("fails closed when the protected projection contains %s", async (_label, patch) => {
    rpc.mockResolvedValue({
      data: [{ ...draftRow(), ...patch }],
      error: null,
    });

    await expect(getEventDraft(client, draftId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("maps database failures without exposing their raw detail", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "NOT_FOUND", details: "protected database detail" },
    });

    await expect(getEventDraft(client, draftId)).rejects.toEqual(
      new DomainError("NOT_FOUND", { cause: expect.anything() }),
    );
  });

  it("requires an affirmative discard result", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(discardEventDraft(client, draftId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("strictly parses the final event and forwards the audit request id", async () => {
    rpc.mockResolvedValue({
      data: [{ event_id: eventId, status: "pending_group_review" }],
      error: null,
    });

    await expect(finalizeEventDraft(client, draftId, groupId)).resolves.toEqual({
      id: eventId,
      status: "pending_group_review",
    });
    expect(rpc).toHaveBeenCalledWith("finalize_event_draft", {
      input_draft_id: draftId,
      audit_request_id: groupId,
    });
  });

  it("fails closed if finalization unexpectedly returns a draft lifecycle", async () => {
    rpc.mockResolvedValue({
      data: [{ event_id: eventId, status: "draft" }],
      error: null,
    });

    await expect(finalizeEventDraft(client, draftId, groupId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
