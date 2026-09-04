import { expect, it, vi } from "vitest";
import { expiredVenueBilling } from "@/tests/fixtures/venue-billing";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getVenueWorkspace: vi.fn(),
  rpc: vi.fn(),
  billing: vi.fn(),
}));

vi.mock("react", () => ({
  cache: <Arguments extends readonly unknown[], Result>(
    operation: (...arguments_: Arguments) => Result,
  ) => {
    const results = new Map<string, Result>();
    return (...arguments_: Arguments) => {
      const key = JSON.stringify(arguments_);
      if (!results.has(key)) results.set(key, operation(...arguments_));
      return results.get(key) as Result;
    };
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/features/venue-billing/queries", () => ({
  getVenueBillingContext: mocks.billing,
}));
vi.mock("@/features/venues/workspace/queries", () => ({
  getVenueWorkspace: mocks.getVenueWorkspace,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  getAppShellState,
  getAuthorizedVenueWorkspaceBySlug,
  getDiscoveryViewerCacheScope,
} from "./queries";

const venueId = "e4000000-0000-4000-8000-000000000102";

it("shares one request-scoped workspace-list RPC between the shell and venue authorization", async () => {
  mocks.createClient.mockResolvedValue({
    auth: { getClaims: mocks.getClaims },
    rpc: mocks.rpc,
  });
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: "e4000000-0000-4000-8000-000000000101" } },
    error: null,
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "list_my_workspaces"
        ? [
            {
              workspace_kind: "venue",
              workspace_id: venueId,
              slug: "corner",
              name: "Corner",
              role: "owner",
            },
          ]
        : false,
    error: null,
  }));
  mocks.getVenueWorkspace.mockResolvedValue({
    id: venueId,
    slug: "corner",
    name: "Corner",
    role: "owner",
    verificationStatus: "unverified",
    needsAreaSetup: false,
    spaces: [],
  });
  mocks.billing.mockResolvedValue(expiredVenueBilling);

  const [shell, workspace, viewerScope] = await Promise.all([
    getAppShellState(),
    getAuthorizedVenueWorkspaceBySlug("corner"),
    getDiscoveryViewerCacheScope(),
  ]);

  expect(shell.workspace.available).toHaveLength(1);
  expect(workspace).toMatchObject({ id: venueId, role: "owner" });
  expect(viewerScope).toBe("fan:e4000000-0000-4000-8000-000000000101");
  expect(mocks.getClaims).toHaveBeenCalledOnce();
  expect(mocks.rpc.mock.calls.filter(([name]) => name === "list_my_workspaces")).toHaveLength(1);
});
