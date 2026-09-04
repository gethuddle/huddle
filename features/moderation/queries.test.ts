import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  listModerationAppeals,
  listModerationReports,
  listMyReports,
  listPlatformModerationActions,
} from "./queries";

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

function platformActionRow() {
  return {
    moderation_action_id: "b1100000-0000-4000-8000-000000000701",
    target_type: "profile",
    target_label: "reported_fan",
    action: "temporary_suspension",
    reason: "A bounded moderation decision reason.",
    expires_at: "2026-08-29T16:00:00Z",
    created_at: "2026-08-28T16:00:00Z",
    reversed_at: null,
    reversal_reason: null,
    has_active_appeal: true,
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

  it("keeps erased reporters and appellants in their authorized queues without recovering identity", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_moderation_reports") {
        return {
          data: [
            {
              report_id: reportId,
              reporter_handle: null,
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
        };
      }
      return {
        data: [
          {
            appeal_id: "b1100000-0000-4000-8000-000000000501",
            moderation_action_id: "b1100000-0000-4000-8000-000000000701",
            appellant_handle: null,
            action: "temporary_suspension",
            appeal_reason: "Please review the factual context.",
            status: "open",
            original_moderator_id: "b1100000-0000-4000-8000-000000000702",
            can_current_moderator_review: true,
            created_at: "2026-08-28T16:00:00Z",
          },
        ],
        error: null,
      };
    });

    await expect(listModerationReports()).resolves.toMatchObject([
      { reporter_handle: null, report_id: reportId },
    ]);
    await expect(listModerationAppeals()).resolves.toMatchObject([
      { appellant_handle: null, appeal_id: "b1100000-0000-4000-8000-000000000501" },
    ]);
  });

  it("requires the active-appeal state in the moderator action inventory", async () => {
    mocks.rpc.mockResolvedValue({ data: [platformActionRow()], error: null });

    await expect(listPlatformModerationActions()).resolves.toEqual([platformActionRow()]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_moderation_actions", {
      input_active_only: true,
      input_limit: 20,
      input_offset: 0,
    });
  });

  it("fails closed when the moderator action inventory omits appeal state", async () => {
    const incompleteAction: Partial<ReturnType<typeof platformActionRow>> = platformActionRow();
    delete incompleteAction.has_active_appeal;
    mocks.rpc.mockResolvedValue({ data: [incompleteAction], error: null });

    await expect(listPlatformModerationActions()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
