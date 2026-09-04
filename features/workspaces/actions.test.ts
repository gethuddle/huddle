import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
  cookies: vi.fn(),
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";

import {
  acceptCommonOnboardingAction,
  activateVenueOnboardingAction,
  selectWorkspaceAction,
} from "./actions";

const fanId = "e4000000-0000-4000-8000-000000000101";
const venueId = "e4000000-0000-4000-8000-000000000102";

describe("workspace actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet, set: mocks.cookieSet });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.getRequestId.mockResolvedValue("e4000000-0000-4000-8000-000000000199");
  });

  it("writes the remembered cookie only after current workspace revalidation", async () => {
    const rpc = vi.fn().mockResolvedValue({
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
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const form = new FormData();
    form.set("kind", "fan");
    form.set("id", fanId);

    await expect(selectWorkspaceAction(null, form)).resolves.toMatchObject({
      ok: true,
      data: { redirectTo: "/" },
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      `fan:${fanId}`,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );

    form.set("kind", "venue");
    form.set("id", venueId);
    await expect(selectWorkspaceAction(null, form)).resolves.toMatchObject({ ok: false });
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
  });

  it("records common safety without activating either workspace", async () => {
    const rpc = vi.fn().mockImplementation(async (name: string) => ({
      data:
        name === "accept_common_onboarding"
          ? [
              {
                adult_attested_at: "2026-08-30T08:00:00Z",
                rules_version: CURRENT_COMMUNITY_RULES_VERSION,
                rules_accepted_at: "2026-08-30T08:00:00Z",
              },
            ]
          : [],
      error: null,
    }));
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const form = new FormData();
    form.set("adultAttested", "on");
    form.set("rulesAccepted", "on");
    form.set("rulesVersion", String(CURRENT_COMMUNITY_RULES_VERSION));

    await expect(acceptCommonOnboardingAction(null, form)).resolves.toMatchObject({
      ok: true,
      data: { redirectTo: "/onboarding/venue" },
    });
    expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    expect(rpc).toHaveBeenCalledWith("accept_common_onboarding", {
      input_adult_attested: true,
      input_rules_version: CURRENT_COMMUNITY_RULES_VERSION,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "list_my_workspaces");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "Fan-only",
      remembered: undefined,
      rows: [
        {
          workspace_kind: "fan",
          workspace_id: fanId,
          slug: "matchday_fan",
          name: "Matchday Fan",
          role: "fan",
        },
      ],
      cookie: `fan:${fanId}`,
      redirectTo: "/",
    },
    {
      label: "Venue-only",
      remembered: undefined,
      rows: [
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ],
      cookie: `venue:${venueId}`,
      redirectTo: "/venues/match-corner/workspace",
    },
    {
      label: "Fan plus Venue with remembered Venue",
      remembered: `venue:${venueId}`,
      rows: [
        {
          workspace_kind: "fan",
          workspace_id: fanId,
          slug: "matchday_fan",
          name: "Matchday Fan",
          role: "fan",
        },
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ],
      cookie: `venue:${venueId}`,
      redirectTo: "/venues/match-corner/workspace",
    },
    {
      label: "Fan plus Venue with an invalid remembered workspace",
      remembered: "venue:e4000000-0000-4000-8000-000000000199",
      rows: [
        {
          workspace_kind: "fan",
          workspace_id: fanId,
          slug: "matchday_fan",
          name: "Matchday Fan",
          role: "fan",
        },
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ],
      cookie: `fan:${fanId}`,
      redirectTo: "/",
    },
  ])(
    "recovers $label after current rules acceptance",
    async ({ remembered, rows, cookie, redirectTo }) => {
      mocks.cookieGet.mockReturnValue(
        remembered === undefined ? undefined : { name: "huddle-workspace", value: remembered },
      );
      const rpc = vi.fn().mockImplementation(async (name: string) => ({
        data:
          name === "accept_common_onboarding"
            ? [
                {
                  adult_attested_at: "2026-08-30T08:00:00Z",
                  rules_version: CURRENT_COMMUNITY_RULES_VERSION,
                  rules_accepted_at: "2026-08-30T08:00:00Z",
                },
              ]
            : rows,
        error: null,
      }));
      mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
      const form = new FormData();
      form.set("adultAttested", "on");
      form.set("rulesAccepted", "on");
      form.set("rulesVersion", String(CURRENT_COMMUNITY_RULES_VERSION));

      await expect(acceptCommonOnboardingAction(null, form)).resolves.toMatchObject({
        ok: true,
        data: { redirectTo },
      });
      expect(mocks.cookieSet).toHaveBeenCalledWith(
        "huddle-workspace",
        cookie,
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
      );
    },
  );

  it("activates a Venue through the common gate and revalidates membership before the cookie", async () => {
    const rpc = vi.fn().mockImplementation(async (name: string) =>
      name === "create_venue_workspace_v2"
        ? {
            data: [
              {
                venue_id: venueId,
                slug: "match-corner",
                verification_status: "unverified",
              },
            ],
            error: null,
          }
        : {
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
          },
    );
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await expect(
      activateVenueOnboardingAction({
        name: "Match Corner",
        slug: "match-corner",
        address: {
          id: "osm-101",
          label: "10 Herzl Street, Haifa, Israel",
          longitude: 34.989,
          latitude: 32.815,
        },
        description: "A welcoming match-day venue.",
        mainSpaceName: "Main screen",
        mainSpaceCapacity: 80,
        defaultAttendanceMode: "reservations",
        facilities: ["wheelchair_accessible", "food"],
        houseInformation: "Order at the bar.",
        defaultRequiresApproval: false,
        representationAttested: true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { redirectTo: "/venues/match-corner/workspace/billing" },
    });

    expect(mocks.requireActor).toHaveBeenCalledWith("common");
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "create_venue_workspace_v2",
      expect.objectContaining({
        input_default_attendance_mode: "reservations",
        input_address_text: "10 Herzl Street, Haifa, Israel",
        input_longitude: 34.989,
        input_latitude: 32.815,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(2, "list_my_workspaces");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "huddle-workspace",
      `venue:${venueId}`,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  it("does not remember a newly created Venue until current membership is visible", async () => {
    const rpc = vi.fn().mockImplementation(async (name: string) =>
      name === "create_venue_workspace_v2"
        ? {
            data: [
              {
                venue_id: venueId,
                slug: "match-corner",
                verification_status: "unverified",
              },
            ],
            error: null,
          }
        : { data: [], error: null },
    );
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await expect(
      activateVenueOnboardingAction({
        name: "Match Corner",
        slug: "match-corner",
        address: {
          id: "osm-101",
          label: "10 Herzl Street, Haifa, Israel",
          longitude: 34.989,
          latitude: 32.815,
        },
        description: "A welcoming match-day venue.",
        mainSpaceName: "Main screen",
        mainSpaceCapacity: 80,
        defaultAttendanceMode: "reservations",
        facilities: [],
        houseInformation: "",
        defaultRequiresApproval: false,
        representationAttested: true,
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
