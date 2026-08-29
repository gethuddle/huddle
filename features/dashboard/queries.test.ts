import { beforeEach, describe, expect, it, vi } from "vitest";

import { listMyGroupsForViewer } from "./queries";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

describe("listMyGroupsForViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer-id" } } });
    mocks.maybeSingle.mockResolvedValue({
      data: { profile_completed_at: "2026-08-29T12:00:00.000Z" },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
      rpc: mocks.rpc,
    });
  });

  it("keeps public group discovery usable when account personalization is restricted", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "ACCOUNT_RESTRICTED" } });

    await expect(listMyGroupsForViewer()).resolves.toEqual([]);
  });

  it("does not hide an unexpected database failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    await expect(listMyGroupsForViewer()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
