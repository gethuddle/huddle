import { describe, expect, it, vi } from "vitest";

import {
  clearSessionOrigin,
  readSessionOrigin,
  SESSION_ORIGIN_KEY,
  writeSessionOrigin,
} from "./session-origin";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
    removeItem: vi.fn(() => {
      value = null;
    }),
  };
}

describe("session-only discovery origin", () => {
  it("round-trips a bounded browser origin", () => {
    const target = storage();
    const origin = { lat: 32.8, lng: 35, label: "Current location", kind: "browser" as const };

    expect(writeSessionOrigin(target, origin)).toBe(true);

    expect(target.setItem).toHaveBeenCalledWith(SESSION_ORIGIN_KEY, JSON.stringify(origin));
    expect(readSessionOrigin(target)).toEqual(origin);
  });

  it("refuses an out-of-Israel origin without writing or throwing", () => {
    const target = storage();

    expect(
      writeSessionOrigin(target, {
        lat: 40.71,
        lng: -74,
        label: "Current location",
        kind: "browser",
      }),
    ).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
  });

  it("clears malformed, out-of-Israel, and persistent-looking values", () => {
    for (const raw of [
      "not-json",
      JSON.stringify({ lat: 51.5, lng: -0.1, label: "London", kind: "address" }),
      JSON.stringify({ lat: 32.8, lng: 35, label: "Home", kind: "cookie" }),
    ]) {
      const target = storage(raw);
      expect(readSessionOrigin(target)).toBeNull();
      expect(target.removeItem).toHaveBeenCalledWith(SESSION_ORIGIN_KEY);
    }
  });

  it("removes a remembered origin explicitly", () => {
    const target = storage();
    clearSessionOrigin(target);
    expect(target.removeItem).toHaveBeenCalledWith(SESSION_ORIGIN_KEY);
  });
});
