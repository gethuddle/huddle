import { afterEach, describe, expect, it, vi } from "vitest";

import { chooseWorkspace, workspaceCookieOptions, workspaceLanding } from "./state";
import type { WorkspaceSummary } from "./types";

const fan: WorkspaceSummary = {
  kind: "fan",
  id: "e4000000-0000-4000-8000-000000000101",
  slug: "matchday_fan",
  label: "Matchday Fan",
  role: "fan",
};
const venue: WorkspaceSummary = {
  kind: "venue",
  id: "e4000000-0000-4000-8000-000000000102",
  slug: "match-corner",
  label: "Match Corner",
  role: "owner",
};

describe("workspace selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the remembered workspace only while it remains authorized", () => {
    expect(chooseWorkspace([fan, venue], { kind: "venue", id: venue.id })).toEqual(venue);
    expect(
      chooseWorkspace([fan], {
        kind: "venue",
        id: venue.id,
      }),
    ).toEqual(fan);
  });

  it("prefers Fan for an unremembered multi-workspace account", () => {
    expect(chooseWorkspace([venue, fan], null)).toEqual(fan);
    expect(chooseWorkspace([], null)).toBeNull();
  });

  it("builds only fixed workspace landing routes", () => {
    expect(workspaceLanding(fan)).toBe("/");
    expect(workspaceLanding(venue)).toBe("/venues/match-corner/workspace");
  });

  it("uses a host-only production cookie with safe cross-site defaults", () => {
    vi.stubEnv("NODE_ENV", "production");

    const options = workspaceCookieOptions();
    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(options).not.toHaveProperty("domain");
  });
});
