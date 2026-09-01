import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  listApprovedEventAttendees,
  listEventAttendance,
  listEventInviteLinks,
  listEventInvitations,
  listMyEventParticipation,
} from "./queries";

const attendanceRow = {
  attendance_id: "90000000-0000-4000-8000-000000000601",
  user_id: "90000000-0000-4000-8000-000000000102",
  requester_handle: "supporter",
  requester_display_name: "Supporter One",
  status: "requested",
  source: "self_request",
  requested_at: "2026-08-28T12:00:00Z",
  removal_reason: null,
  verified_account: true,
  account_age_days: 40,
  mutual_friend_count: 2,
  shared_active_group_count: 1,
  follows_sport: true,
  follows_competition: false,
  follows_home_team: true,
  follows_away_team: false,
  follows_audience_team: false,
  review_mode: "decline_only",
  review_reason: "The event is full. Only decline remains.",
  can_approve: false,
  total_count: 1,
};

describe("listEventAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("parses the server-derived review mode used by management controls", async () => {
    mocks.rpc.mockResolvedValue({ data: [attendanceRow], error: null });

    await expect(listEventAttendance("90000000-0000-4000-8000-000000000401", 1)).resolves.toEqual([
      expect.objectContaining({
        review_mode: "decline_only",
        review_reason: "The event is full. Only decline remains.",
        can_approve: false,
      }),
    ]);
  });

  it("fails closed if review mode and approval capability disagree", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...attendanceRow, review_mode: "decline_only", can_approve: true }],
      error: null,
    });

    await expect(
      listEventAttendance("90000000-0000-4000-8000-000000000401", 1),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("bounds page 501 at offset 10000 for both event-management collections", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await Promise.all([
      listEventAttendance("90000000-0000-4000-8000-000000000401", 501),
      listEventInvitations("90000000-0000-4000-8000-000000000401", 501),
    ]);

    expect(mocks.rpc).toHaveBeenCalledWith("list_event_attendance", {
      input_event_id: "90000000-0000-4000-8000-000000000401",
      input_limit: 20,
      input_offset: 10_000,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_event_invitations", {
      input_event_id: "90000000-0000-4000-8000-000000000401",
      input_limit: 20,
      input_offset: 10_000,
    });
  });

  it("bounds a direct above-window page before attendance RPC offset multiplication", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await listEventAttendance("90000000-0000-4000-8000-000000000401", 502);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_event_attendance",
      expect.objectContaining({ input_offset: 10_000 }),
    );
  });

  it("bounds every direct attendance collection helper before page multiplication", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await Promise.all([
      listMyEventParticipation(Number.MAX_SAFE_INTEGER),
      listApprovedEventAttendees("90000000-0000-4000-8000-000000000401", Number.MAX_SAFE_INTEGER),
    ]);

    expect(mocks.rpc).toHaveBeenCalledWith("list_my_event_participation", {
      input_limit: 20,
      input_offset: 10_000,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_approved_event_attendees", {
      input_event_id: "90000000-0000-4000-8000-000000000401",
      input_limit: 20,
      input_offset: 10_000,
    });
  });

  it("parses non-secret event invite-link metadata", async () => {
    const eventId = "90000000-0000-4000-8000-000000000401";
    mocks.rpc.mockResolvedValue({
      data: [
        {
          invite_token_id: "90000000-0000-4000-8000-000000000701",
          creator_handle: "host",
          expires_at: "2026-09-07T12:00:00Z",
          max_uses: 10,
          use_count: 2,
          revoked_at: null,
          invite_status: "active",
          created_at: "2026-08-31T12:00:00Z",
        },
      ],
      error: null,
    });

    await expect(listEventInviteLinks(eventId)).resolves.toEqual([
      expect.objectContaining({ invite_status: "active", use_count: 2, max_uses: 10 }),
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_event_invite_tokens", {
      input_event_id: eventId,
    });
  });
});
