// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearHuddleSessionStorage } from "./huddle-session-storage";

describe("clearHuddleSessionStorage", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("removes every Huddle-owned key while preserving unrelated tab state", () => {
    window.sessionStorage.setItem("huddle:discovery-origin", "private-location");
    window.sessionStorage.setItem("huddle:onboarding:fan-id:fan:v1", "fan-draft");
    window.sessionStorage.setItem("huddle:onboarding:fan-id:venue:v1", "venue-draft");
    window.sessionStorage.setItem("huddle:future:v1", "future-private-state");
    window.sessionStorage.setItem("third-party", "keep-me");

    expect(clearHuddleSessionStorage(window.sessionStorage)).toBe(true);

    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBeNull();
    expect(window.sessionStorage.getItem("huddle:onboarding:fan-id:fan:v1")).toBeNull();
    expect(window.sessionStorage.getItem("huddle:onboarding:fan-id:venue:v1")).toBeNull();
    expect(window.sessionStorage.getItem("huddle:future:v1")).toBeNull();
    expect(window.sessionStorage.getItem("third-party")).toBe("keep-me");
  });

  it("never blocks account exit when browser storage is unavailable", () => {
    const blockedStorage = {
      get length(): number {
        throw new Error("storage blocked");
      },
      key: () => null,
      removeItem: () => undefined,
    };

    expect(clearHuddleSessionStorage(blockedStorage)).toBe(false);

    const browserStorage = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access denied", "SecurityError");
    });
    expect(clearHuddleSessionStorage()).toBe(false);
    browserStorage.mockRestore();

    const ignoredRemoval = {
      length: 1,
      key: () => "huddle:private-state",
      removeItem: () => undefined,
    };
    expect(clearHuddleSessionStorage(ignoredRemoval)).toBe(false);
  });
});
