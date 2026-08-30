import { describe, expect, it } from "vitest";

import {
  findReviewedPilotCity,
  isPointWithinReviewedPilotCity,
  REVIEWED_PILOT_CITIES,
} from "./pilot-cities";

describe("reviewed pilot city location catalog", () => {
  it("stays aligned with the exact 13 active hosted-city migration entries", () => {
    expect(REVIEWED_PILOT_CITIES).toEqual([
      {
        slug: "jerusalem",
        label: "Jerusalem",
        center: { latitude: 31.76904, longitude: 35.21633 },
      },
      {
        slug: "tel-aviv-yafo",
        label: "Tel Aviv-Yafo",
        center: { latitude: 32.08088, longitude: 34.78057 },
      },
      {
        slug: "haifa",
        label: "Haifa",
        center: { latitude: 32.81303, longitude: 34.99928 },
      },
      {
        slug: "rishon-lezion",
        label: "Rishon LeZion",
        center: { latitude: 31.97102, longitude: 34.78939 },
      },
      {
        slug: "petah-tikva",
        label: "Petah Tikva",
        center: { latitude: 32.08707, longitude: 34.88747 },
      },
      {
        slug: "netanya",
        label: "Netanya",
        center: { latitude: 32.33294, longitude: 34.85917 },
      },
      {
        slug: "ashdod",
        label: "Ashdod",
        center: { latitude: 31.79213, longitude: 34.64966 },
      },
      {
        slug: "bnei-brak",
        label: "Bnei Brak",
        center: { latitude: 32.08074, longitude: 34.8338 },
      },
      {
        slug: "holon",
        label: "Holon",
        center: { latitude: 32.01034, longitude: 34.77918 },
      },
      {
        slug: "beer-sheva",
        label: "Be'er Sheva",
        center: { latitude: 31.25181, longitude: 34.7913 },
      },
      {
        slug: "ramat-gan",
        label: "Ramat Gan",
        center: { latitude: 32.08227, longitude: 34.81065 },
      },
      {
        slug: "rehovot",
        label: "Rehovot",
        center: { latitude: 31.89421, longitude: 34.81199 },
      },
      {
        slug: "ashkelon",
        label: "Ashkelon",
        center: { latitude: 31.66926, longitude: 34.57149 },
      },
    ]);
  });

  it("rejects unsupported or inactive identifiers instead of selecting a default city", () => {
    expect(findReviewedPilotCity("inactive-pilot-city")).toBeNull();
    expect(findReviewedPilotCity("Jerusalem")).toBeNull();
    expect(findReviewedPilotCity(null)).toBeNull();
  });

  it("accepts only points within the conservative radius of the reviewed city center", () => {
    const haifa = findReviewedPilotCity("haifa");
    expect(haifa).not.toBeNull();
    if (haifa === null) return;

    expect(isPointWithinReviewedPilotCity(haifa, { latitude: 32.84, longitude: 35.02 })).toBe(true);
    expect(isPointWithinReviewedPilotCity(haifa, { latitude: 33.1, longitude: 35.3 })).toBe(false);
  });
});
