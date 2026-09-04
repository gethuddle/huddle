import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expiredVenueBilling } from "@/tests/fixtures/venue-billing";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getVenueWorkspace: vi.fn(),
  getUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
  rpc: vi.fn(),
  billing: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/features/venue-billing/queries", () => ({ getVenueBillingContext: mocks.billing }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/venues/workspace/queries", () => ({
  getVenueWorkspace: mocks.getVenueWorkspace,
}));

import {
  getAppShellState,
  getAuthorizedVenueWorkspaceBySlug,
  getWorkspaceSetupAvailability,
  listMyRecoverableWorkspaces,
} from "./queries";

const fanId = "e4000000-0000-4000-8000-000000000101";
const venueId = "e4000000-0000-4000-8000-000000000102";

describe("workspace shell query", () => {
  it("retains an expired member workspace with the safe recovery projection", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: [
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "corner",
          name: "Corner",
          role: "admin",
        },
      ],
    });
    mocks.getVenueWorkspace.mockResolvedValue({ id: venueId, slug: "corner", role: "admin" });
    mocks.billing.mockResolvedValue(expiredVenueBilling);
    expect(await getAuthorizedVenueWorkspaceBySlug("corner")).toMatchObject({
      id: venueId,
      billing: expiredVenueBilling,
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: mocks.profileMaybeSingle }) }),
      }),
      rpc: mocks.rpc,
    });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("returns a public-safe empty context when signed out", async () => {
    await expect(getAppShellState()).resolves.toEqual({
      isSignedIn: false,
      workspace: { active: null, available: [], isModerator: false },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("drops a revoked remembered Venue and falls back to Fan", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: fanId } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: fanId } }, error: null });
    mocks.cookieGet.mockReturnValue({ name: "huddle-workspace", value: `venue:${venueId}` });
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "list_my_workspaces"
        ? {
            data: [
              {
                workspace_kind: "fan",
                workspace_id: fanId,
                slug: "matchday_fan",
                name: "Matchday Fan",
                role: "fan",
              },
            ],
            error: null,
          }
        : { data: true, error: null },
    );

    await expect(getAppShellState()).resolves.toMatchObject({
      isSignedIn: true,
      workspace: {
        active: { kind: "fan", id: fanId },
        available: [{ kind: "fan", id: fanId }],
        isModerator: true,
      },
    });
  });

  it("uses verified session claims consistently when a parallel user lookup is unavailable", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: fanId } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("temporary lookup") });
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "list_my_workspaces"
        ? {
            data: [
              {
                workspace_kind: "fan",
                workspace_id: fanId,
                slug: "matchday_fan",
                name: "Matchday Fan",
                role: "fan",
              },
            ],
            error: null,
          }
        : { data: false, error: null },
    );

    await expect(getAppShellState()).resolves.toMatchObject({
      isSignedIn: true,
      workspace: { active: { kind: "fan", id: fanId } },
    });
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });

  it("marks the shell's authorized workspace and moderator reads for React request-scoped deduplication", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: fanId } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "list_my_workspaces"
          ? [
              {
                workspace_kind: "fan",
                workspace_id: fanId,
                slug: "matchday_fan",
                name: "Matchday Fan",
                role: "fan",
              },
            ]
          : false,
      error: null,
    }));

    const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

    expect(source).toContain("export const getAppShellState = cache(");
    expect(source).toContain('supabase.rpc("list_my_workspaces")');
    expect(source).toContain('supabase.rpc("viewer_is_platform_moderator")');
  });

  it("maps only the authenticated actor existing workspaces for stale-rules recovery", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "list_my_workspace_recovery"
        ? {
            data: [
              {
                workspace_kind: "venue",
                workspace_id: venueId,
                slug: "match-corner",
                name: "Match Corner",
                role: "owner",
              },
            ],
            error: null,
          }
        : { data: null, error: null },
    );

    await expect(listMyRecoverableWorkspaces()).resolves.toEqual([
      {
        kind: "venue",
        id: venueId,
        slug: "match-corner",
        label: "Match Corner",
        role: "owner",
      },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_workspace_recovery");
  });

  it("does not query private Venue workspace data without current membership", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          workspace_kind: "fan",
          workspace_id: fanId,
          slug: "matchday_fan",
          name: "Matchday Fan",
          role: "fan",
        },
      ],
      error: null,
    });

    await expect(getAuthorizedVenueWorkspaceBySlug("private-venue")).resolves.toBeNull();
    expect(mocks.getVenueWorkspace).not.toHaveBeenCalled();
  });

  it("fails a workspace-only route closed when authorization cannot be established", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(getAuthorizedVenueWorkspaceBySlug("private-venue")).resolves.toBeNull();
    expect(mocks.getVenueWorkspace).not.toHaveBeenCalled();
  });

  it("keeps an authorized Venue projection failure non-disclosing", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "private-venue",
          name: "Private Venue",
          role: "admin",
        },
      ],
      error: null,
    });
    mocks.getVenueWorkspace.mockRejectedValue(new Error("private projection failed"));

    await expect(getAuthorizedVenueWorkspaceBySlug("private-venue")).resolves.toBeNull();
  });

  it("offers setup only to a verified, active, non-restricted account", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: fanId, email_confirmed_at: "2026-08-30T08:00:00Z" } },
      error: null,
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { suspended_at: null, community_restricted_at: null },
      error: null,
    });

    await expect(getWorkspaceSetupAvailability()).resolves.toEqual({
      canStartFan: true,
      canStartVenue: true,
    });

    mocks.profileMaybeSingle.mockResolvedValue({
      data: {
        suspended_at: null,
        community_restricted_at: "2026-08-30T09:00:00Z",
      },
      error: null,
    });
    await expect(getWorkspaceSetupAvailability()).resolves.toEqual({
      canStartFan: false,
      canStartVenue: false,
    });
  });
});
