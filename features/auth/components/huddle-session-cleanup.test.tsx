// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  broadcastHuddleSessionCleared: vi.fn(),
  clearHuddleSessionStorage: vi.fn(),
  consumeHuddleSessionCleanupAction: vi.fn(),
}));
vi.mock("@/features/auth/huddle-session-events", () => ({
  broadcastHuddleSessionCleared: mocks.broadcastHuddleSessionCleared,
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

  it("clears memory but keeps the one-time marker when browser storage could not be cleared", async () => {
    mocks.clearHuddleSessionStorage.mockReturnValue(false);

    render(<HuddleSessionCleanup purpose="sign-out" />);

    await waitFor(() => expect(mocks.clearHuddleSessionStorage).toHaveBeenCalledOnce());
    expect(mocks.broadcastHuddleSessionCleared).toHaveBeenCalledOnce();
    expect(mocks.consumeHuddleSessionCleanupAction).not.toHaveBeenCalled();
  });

  it("clears private in-memory queries after browser session cleanup succeeds", async () => {
    mocks.clearHuddleSessionStorage.mockReturnValue(true);

    render(<HuddleSessionCleanup purpose="sign-out" />);

    await waitFor(() => expect(mocks.consumeHuddleSessionCleanupAction).toHaveBeenCalledOnce());
    expect(mocks.broadcastHuddleSessionCleared).toHaveBeenCalledOnce();
  });
});
