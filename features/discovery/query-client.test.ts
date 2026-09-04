// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { HUDDLE_SESSION_CLEARED_EVENT } from "@/features/auth/huddle-session-events";

import { clearDiscoveryQueryClient, getDiscoveryQueryClient } from "./query-client";

describe("the Explore query client", () => {
  afterEach(() => clearDiscoveryQueryClient());

  it("survives an Explore route unmount within the same browser session", () => {
    const first = getDiscoveryQueryClient();
    first.setQueryData(["event-discovery", "private"], { items: ["event"] });

    const returned = getDiscoveryQueryClient();

    expect(returned).toBe(first);
    expect(returned.getQueryData(["event-discovery", "private"])).toEqual({
      items: ["event"],
    });
  });

  it("drops all cached discovery data at the session boundary", () => {
    const first = getDiscoveryQueryClient();
    first.setQueryData(["event-discovery", "private"], { items: ["event"] });

    clearDiscoveryQueryClient();

    const next = getDiscoveryQueryClient();
    expect(next).not.toBe(first);
    expect(next.getQueryCache().getAll()).toHaveLength(0);
  });

  it("drops cached discovery data when the app broadcasts session cleanup", () => {
    const first = getDiscoveryQueryClient();
    first.setQueryData(["event-discovery", "private"], { items: ["event"] });

    window.dispatchEvent(new Event(HUDDLE_SESSION_CLEARED_EVENT));

    const next = getDiscoveryQueryClient();
    expect(next).not.toBe(first);
    expect(next.getQueryCache().getAll()).toHaveLength(0);
  });
});
