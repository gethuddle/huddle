import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createEventInvitationAction,
  createEventInviteLinkAction,
  createEventInvitationsAction,
  leaveEventAction,
  redeemEventInviteLinkAction,
  requestOrJoinEventAction,
  revokeEventInviteLinkAction,
  reviewAttendanceAction,
} from "./actions";

const eventId = "90000000-0000-4000-8000-000000000401";
const attendanceId = "90000000-0000-4000-8000-000000000501";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("attendance server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("90000000-0000-4000-8000-000000000999");
  });

  it("uses the controlled join RPC and refreshes only after database success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ attendance_id: attendanceId, status: "approved" }],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await requestOrJoinEventAction(form({ eventId }));

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(rpc).toHaveBeenCalledWith("request_or_join_event", {
      input_event_id: eventId,
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toEqual({ ok: true, data: { message: "Your place is confirmed." } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/events/${eventId}`);
  });

  it("rejects a malformed invitee handle before actor or database access", async () => {
    const result = await createEventInvitationAction(
      form({ eventId, inviteeHandle: "Not a valid handle" }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("resolves selected profile IDs server-side and explains partial invitation results", async () => {
    const inviteeA = "90000000-0000-4000-8000-000000000102";
    const inviteeB = "90000000-0000-4000-8000-000000000103";
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { profile_id: inviteeA, handle: "supporter_one" },
          { profile_id: inviteeB, handle: "supporter_two" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "INVITEE_NOT_ELIGIBLE" } });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await createEventInvitationsAction({
      eventId,
      inviteeIds: [inviteeA, inviteeB],
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "resolve_event_invitation_candidate_handles", {
      input_event_id: eventId,
      input_profile_ids: [inviteeA, inviteeB],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "create_event_invitation", {
      input_event_id: eventId,
      input_invitee_handle: "supporter_one",
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        message:
          "1 invitation sent. 1 could not be sent; refresh the picker to see current eligibility.",
        invitedIds: [inviteeA],
        rejectedIds: [inviteeB],
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/events/${eventId}/manage`);
  });

  it("maps the transactional full-event token without exposing database detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "EVENT_FULL", details: "private.event_attendance" },
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await reviewAttendanceAction(
      form({ eventId, attendanceId, decision: "approve" }),
    );

    expect(mocks.requireActor).toHaveBeenCalledWith("common");
    expect(result).toEqual({
      ok: false,
      error: { code: "EVENT_FULL", message: "This event is full." },
    });
    expect(JSON.stringify(result)).not.toContain("event_attendance");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps leaving available when current community rules need renewed acceptance", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await leaveEventAction(form({ eventId, attendanceId }));

    expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    expect(rpc).toHaveBeenCalledWith("leave_event", {
      input_attendance_id: attendanceId,
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("creates a bounded event invite link and exposes the raw path only in that response", async () => {
    const inviteTokenId = "90000000-0000-4000-8000-000000000601";
    const inviteToken = "a".repeat(43);
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          invite_token_id: inviteTokenId,
          invite_token: inviteToken,
          expires_at: "2026-09-07T12:00:00.000Z",
          max_uses: 10,
          use_count: 0,
          created_at: "2026-08-31T12:00:00.000Z",
        },
      ],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await createEventInviteLinkAction(
      null,
      form({ eventId, durationDays: "7", maxUses: "10" }),
    );

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(rpc).toHaveBeenCalledWith("create_event_invite_token", {
      input_event_id: eventId,
      input_expires_at: expect.any(String),
      input_max_uses: 10,
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        invitePath: `/join/event/${inviteToken}`,
        message: expect.stringContaining("Copy this link now"),
      },
    });
  });

  it("redeems a valid link into an invitation without accepting attendance", async () => {
    const token = "b".repeat(43);
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          event_id: eventId,
          invitation_id: "90000000-0000-4000-8000-000000000602",
          invitation_status: "pending",
        },
      ],
      error: null,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await redeemEventInviteLinkAction(null, form({ token }));

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(rpc).toHaveBeenCalledWith("redeem_event_invite_token", {
      input_invite_token: token,
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        eventId,
        message: "Invitation added. Open the event to accept or decline it.",
      },
    });
  });

  it("rejects malformed invite tokens before actor or database access", async () => {
    const result = await redeemEventInviteLinkAction(null, form({ token: "guessable" }));

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("revokes an invite link through its non-secret identifier", async () => {
    const inviteTokenId = "90000000-0000-4000-8000-000000000601";
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await revokeEventInviteLinkAction(form({ eventId, inviteTokenId }));

    expect(rpc).toHaveBeenCalledWith("revoke_event_invite_token", {
      input_invite_token_id: inviteTokenId,
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toMatchObject({ ok: true });
  });
});
