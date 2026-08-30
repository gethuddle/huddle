import { describe, expect, it } from "vitest";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";

import {
  venuePlanSchema,
  venueSpaceInputSchema,
  venueSettingsInputSchema,
  venueWorkspaceActivationSchema,
  venueWorkspaceUpdateSchema,
} from "./schemas";

const venueId = "d3000000-0000-4000-8000-000000000301";
const cityId = "d3000000-0000-4000-8000-000000000302";

function activationInput() {
  return {
    name: "Match Corner",
    slug: "match-corner",
    cityId,
    addressText: "12 Stadium Street, Haifa",
    longitude: "34.998",
    latitude: "32.812",
    description: "A welcoming venue for watching the full match together.",
    mainSpaceName: "Main screen",
    mainSpaceCapacity: "120",
    facilities: ["wheelchair_accessible", "food", "drinks"],
    houseInformation: "Order at the bar before kick-off.",
    defaultAttendanceMode: "reservations",
    defaultRequiresApproval: "on",
    adultAttested: "on",
    representationAttested: "on",
    rulesAccepted: "on",
    rulesVersion: String(CURRENT_COMMUNITY_RULES_VERSION),
  };
}

describe("Venue workspace schemas", () => {
  it("accepts the exact activation confirmations and normalized defaults", () => {
    expect(venueWorkspaceActivationSchema.parse(activationInput())).toMatchObject({
      mainSpaceName: "Main screen",
      mainSpaceCapacity: 120,
      facilities: ["wheelchair_accessible", "food", "drinks"],
      defaultAttendanceMode: "reservations",
      defaultRequiresApproval: true,
      adultAttested: true,
      representationAttested: true,
      rulesAccepted: true,
      rulesVersion: CURRENT_COMMUNITY_RULES_VERSION,
    });
  });

  it.each(["adultAttested", "representationAttested", "rulesAccepted"] as const)(
    "rejects activation when %s is not checked",
    (field) => {
      expect(
        venueWorkspaceActivationSchema.safeParse({ ...activationInput(), [field]: undefined })
          .success,
      ).toBe(false);
    },
  );

  it("rejects stale rules, unknown facilities, and non-positive initial capacity", () => {
    expect(
      venueWorkspaceActivationSchema.safeParse({
        ...activationInput(),
        rulesVersion: String(CURRENT_COMMUNITY_RULES_VERSION + 1),
      }).success,
    ).toBe(false);
    expect(
      venueWorkspaceActivationSchema.safeParse({
        ...activationInput(),
        facilities: ["teleportation"],
      }).success,
    ).toBe(false);
    expect(
      venueWorkspaceActivationSchema.safeParse({
        ...activationInput(),
        mainSpaceCapacity: "0",
      }).success,
    ).toBe(false);
  });

  it("allows a walk-in Venue to omit capacity and rejects mixed attendance defaults", () => {
    expect(
      venueWorkspaceActivationSchema.parse({
        ...activationInput(),
        defaultAttendanceMode: "open_door",
        mainSpaceCapacity: "",
        defaultRequiresApproval: false,
      }),
    ).toMatchObject({
      defaultAttendanceMode: "open_door",
      mainSpaceCapacity: null,
      defaultRequiresApproval: false,
    });
    expect(
      venueWorkspaceActivationSchema.safeParse({
        ...activationInput(),
        defaultAttendanceMode: "open_door",
      }).success,
    ).toBe(false);
    expect(
      venueWorkspaceActivationSchema.safeParse({
        ...activationInput(),
        defaultAttendanceMode: "reservations",
        mainSpaceCapacity: "",
      }).success,
    ).toBe(false);
  });

  it("keeps updates and area edits tied to one concrete Venue", () => {
    expect(
      venueWorkspaceUpdateSchema.parse({
        venueId,
        name: "Match Corner",
        slug: "match-corner",
        cityId,
        addressText: "12 Stadium Street, Haifa",
        longitude: "34.998",
        latitude: "32.812",
        description: "A welcoming venue for watching the full match together.",
        facilities: ["parking", "food"],
        houseInformation: "Doors open one hour before kick-off.",
        defaultAttendanceMode: "reservations",
        defaultRequiresApproval: false,
      }),
    ).toMatchObject({ venueId, defaultRequiresApproval: false });

    expect(
      venueSpaceInputSchema.parse({
        venueId,
        spaceId: "",
        name: "Terrace screen",
        capacity: "45",
        active: "on",
        sortOrder: "2",
      }),
    ).toMatchObject({ venueId, spaceId: null, capacity: 45, active: true, sortOrder: 2 });
  });

  it("bounds a venue batch and permits only event-specific overrides", () => {
    const spaceId = "d3000000-0000-4000-8000-000000000303";
    const matchId = "d3000000-0000-4000-8000-000000000304";
    expect(
      venuePlanSchema.parse({
        venueId,
        venueSlug: "match-corner",
        intent: "publish",
        items: [
          {
            matchId,
            venueSpaceId: spaceId,
            attendanceMode: "reservations",
            title: "Derby night",
            description: null,
            capacity: 40,
            requiresApproval: false,
          },
        ],
      }),
    ).toMatchObject({ items: [{ matchId, venueSpaceId: spaceId, capacity: 40 }] });

    expect(
      venuePlanSchema.parse({
        venueId,
        venueSlug: "match-corner",
        intent: "publish",
        items: [
          {
            matchId,
            venueSpaceId: spaceId,
            attendanceMode: "open_door",
            capacity: null,
            requiresApproval: null,
          },
        ],
      }),
    ).toMatchObject({
      items: [{ matchId, attendanceMode: "open_door", capacity: null }],
    });

    expect(
      venuePlanSchema.safeParse({
        venueId,
        venueSlug: "match-corner",
        intent: "draft",
        items: Array.from({ length: 21 }, () => ({ matchId, venueSpaceId: spaceId })),
      }).success,
    ).toBe(false);
    expect(
      venuePlanSchema.safeParse({
        venueId,
        venueSlug: "match-corner",
        intent: "draft",
        items: [{ matchId, venueSpaceId: spaceId, audience: "friends" }],
      }).success,
    ).toBe(false);
  });

  it("validates settings without requiring coordinates for an unchanged public address", () => {
    expect(
      venueSettingsInputSchema.parse({
        venueId,
        name: "Match Corner",
        slug: "match-corner",
        cityId,
        description: "A welcoming venue for watching the full match together.",
        facilities: ["food", "drinks"],
        houseInformation: "Order at the bar before kick-off.",
        defaultAttendanceMode: "reservations",
        defaultRequiresApproval: true,
        address: null,
      }),
    ).toMatchObject({ venueId, address: null });
  });
});
