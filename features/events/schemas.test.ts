import { describe, expect, it } from "vitest";

import { privateEventFormSchema } from "./schemas";

const validHomeEvent = {
  eventId: "",
  matchId: "60000000-0000-4000-8000-000000000101",
  title: "Arsenal at Guy's",
  description: "A calm home watch party for the full match.",
  expectedActivity: "Watch the full match together",
  costDescription: "Free",
  eventRules: "Respect the host and every attendee.",
  commercialAffiliation: "None",
  hostPresenceConfirmed: true,
  placeKind: "home",
  publicPlaceName: "",
  publicAddressText: "",
  publicLongitude: "",
  publicLatitude: "",
  privateAddressText: "12 Private Street, Haifa",
  privateDirections: "Ring apartment 4.",
  privateLongitude: "34.99928",
  privateLatitude: "32.81303",
  audience: "invite_only",
  audienceGroupId: "",
  capacity: "6",
  intent: "publish",
};

describe("private event schema", () => {
  it("normalizes a protected home event without public-place fields", () => {
    expect(privateEventFormSchema.parse(validHomeEvent)).toMatchObject({
      eventId: null,
      placeKind: "home",
      audience: "invite_only",
      audienceGroupId: null,
      privateLongitude: 34.99928,
      capacity: 6,
    });
  });

  it("rejects crafted public audiences and the hard home-capacity violation", () => {
    expect(
      privateEventFormSchema.safeParse({
        ...validHomeEvent,
        audience: "public",
        capacity: "13",
      }).success,
    ).toBe(false);
  });

  it("requires the selected group only for a group audience", () => {
    expect(
      privateEventFormSchema.safeParse({
        ...validHomeEvent,
        audience: "group",
        audienceGroupId: "",
      }).success,
    ).toBe(false);
    expect(
      privateEventFormSchema.safeParse({
        ...validHomeEvent,
        audienceGroupId: "60000000-0000-4000-8000-000000000103",
      }).success,
    ).toBe(false);
  });

  it("requires public details for a public place and host presence for every event", () => {
    expect(
      privateEventFormSchema.safeParse({
        ...validHomeEvent,
        placeKind: "public_place",
        privateAddressText: "",
        privateDirections: "",
        privateLongitude: "",
        privateLatitude: "",
      }).success,
    ).toBe(false);
    expect(
      privateEventFormSchema.safeParse({
        ...validHomeEvent,
        hostPresenceConfirmed: false,
      }).success,
    ).toBe(false);
  });
});
