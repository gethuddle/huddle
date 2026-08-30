import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), rpc: vi.fn() }));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));

import { listAttentionItems } from "./queries";

const eventId = "c5000000-0000-4000-8000-000000000501";

describe("listAttentionItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
  });

  it("maps the canonical bounded current-action result", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          key: `event_invitation:${eventId}`,
          kind: "event_invitation",
          resource_id: eventId,
          href: `/events/${eventId}`,
          title: "Event invitation",
          description: "Respond to your invitation for Derby night.",
          created_at: "2026-08-30T06:00:00Z",
        },
      ],
      error: null,
    });

    await expect(listAttentionItems(5)).resolves.toEqual([
      {
        key: `event_invitation:${eventId}`,
        kind: "event_invitation",
        resourceId: eventId,
        href: `/events/${eventId}`,
        title: "Event invitation",
        description: "Respond to your invitation for Derby night.",
        createdAt: "2026-08-30T06:00:00Z",
      },
    ]);
    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(mocks.rpc).toHaveBeenCalledWith("list_attention_items", { input_limit: 5 });
  });

  it("uses an explicit safe default without silently rewriting caller input", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(listAttentionItems()).resolves.toEqual([]);

    expect(mocks.rpc).toHaveBeenCalledWith("list_attention_items", { input_limit: 10 });
  });

  it.each([null, 0, -1, 51])(
    "rejects the invalid explicit limit %s before actor or database access",
    async (limit) => {
      await expect(listAttentionItems(limit as never)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      expect(mocks.requireActor).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("fails closed if the database projection grows a private field", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          key: `event_invitation:${eventId}`,
          kind: "event_invitation",
          resource_id: eventId,
          href: `/events/${eventId}`,
          title: "Event invitation",
          description: "Respond to your invitation.",
          created_at: "2026-08-30T06:00:00Z",
          email: "must-not-cross@example.test",
        },
      ],
      error: null,
    });

    await expect(listAttentionItems()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
