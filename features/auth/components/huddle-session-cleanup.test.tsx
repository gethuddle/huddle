// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearHuddleSessionStorage: vi.fn(),
  consumeHuddleSessionCleanupAction: vi.fn(),
}));

vi.mock("@/features/auth/huddle-session-storage", () => ({
  clearHuddleSessionStorage: mocks.clearHuddleSessionStorage,
}));
vi.mock("@/features/auth/session-cleanup-actions", () => ({
  consumeHuddleSessionCleanupAction: mocks.consumeHuddleSessionCleanupAction,
}));

import { HuddleSessionCleanup } from "./huddle-session-cleanup";

describe("HuddleSessionCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeHuddleSessionCleanupAction.mockResolvedValue(undefined);
  });

  it("keeps the one-time marker available when browser storage could not be cleared", async () => {
    mocks.clearHuddleSessionStorage.mockReturnValue(false);

    render(<HuddleSessionCleanup purpose="sign-out" />);

    await waitFor(() => expect(mocks.clearHuddleSessionStorage).toHaveBeenCalledOnce());
    expect(mocks.consumeHuddleSessionCleanupAction).not.toHaveBeenCalled();
  });
});
