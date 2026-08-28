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
  leaveEventAction,
  requestOrJoinEventAction,
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

  it("maps the transactional full-event token without exposing database detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "EVENT_FULL", details: "private.event_attendance" },
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await reviewAttendanceAction(
      form({ eventId, attendanceId, decision: "approve" }),
    );

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

    expect(mocks.requireActor).toHaveBeenCalledWith("onboarding");
    expect(rpc).toHaveBeenCalledWith("leave_event", {
      input_attendance_id: attendanceId,
      audit_request_id: "90000000-0000-4000-8000-000000000999",
    });
    expect(result).toMatchObject({ ok: true });
  });
});
