import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { listModerationReports, listMyReports } from "./queries";

const reportId = "b1100000-0000-4000-8000-000000000101";

function safeReporterRow() {
  return {
    report_id: reportId,
    target_type: "profile",
    target_label: "reported_fan",
    category: "other",
    safe_status: "received",
    created_at: "2026-08-28T16:00:00Z",
  };
}

describe("moderation projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("accepts only the reporter-safe status projection", async () => {
    mocks.rpc.mockResolvedValue({ data: [safeReporterRow()], error: null });

    await expect(listMyReports()).resolves.toEqual([safeReporterRow()]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_reports", {
      input_limit: 20,
      input_offset: 0,
    });
  });

  it("fails closed if a reporter projection expands to confidential details", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...safeReporterRow(), details: "This must never reach the reporter history." }],
      error: null,
    });

    await expect(listMyReports()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("requires a concrete assignment flag in the platform queue", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          report_id: reportId,
          reporter_handle: "reporting_fan",
          target_type: "profile",
          target_id: "b1100000-0000-4000-8000-000000000102",
          target_label: "reported_fan",
          category: "other",
          details: "A bounded factual account for the platform moderator.",
          status: "open",
          assigned_to_me: false,
          created_at: "2026-08-28T16:00:00Z",
        },
      ],
      error: null,
    });

    await expect(listModerationReports()).resolves.toMatchObject([
      { report_id: reportId, assigned_to_me: false },
    ]);
  });
});
