import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { PhotonPublicGeocoder } from "./photon";

const validFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [34.989, 32.815] },
  properties: {
    osm_type: "N",
    osm_id: 101,
    name: "10 Herzl Street",
    city: "Haifa",
    country: "Israel",
    countrycode: "IL",
  },
};

describe("PhotonPublicGeocoder", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [validFeature] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("uses the bounded Photon search-as-you-type endpoint and normalizes an Israel result", async () => {
    const geocoder = new PhotonPublicGeocoder({ fetch: fetchMock });

    await expect(geocoder.search("10 Herzl Street")).resolves.toEqual([
      {
        id: "N:101",
        label: "10 Herzl Street, Haifa, Israel",
        latitude: 32.815,
        longitude: 34.989,
      },
    ]);

    const [request, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(request.origin + request.pathname).toBe("https://photon.komoot.io/api/");
    expect(request.searchParams.get("q")).toBe("10 Herzl Street, Israel");
    expect(request.searchParams.get("limit")).toBe("5");
    expect(request.searchParams.get("lang")).toBe("en");
    expect(request.searchParams.get("bbox")).toBe("34.2674,29.4534,35.895,33.3356");
    expect(init.redirect).toBe("error");
  });

  it("filters foreign and malformed features and returns at most five results", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            ...Array.from({ length: 6 }, (_, index) => ({
              ...validFeature,
              properties: { ...validFeature.properties, osm_id: index + 1 },
            })),
            {
              ...validFeature,
              properties: { ...validFeature.properties, osm_id: 7, countrycode: "JO" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await new PhotonPublicGeocoder({ fetch: fetchMock }).search("Herzl Street");

    expect(results).toHaveLength(5);
    expect(results.map((result) => result.id)).toEqual(["N:1", "N:2", "N:3", "N:4", "N:5"]);
  });

  it.each([
    [429, "RATE_LIMITED"],
    [503, "UPSTREAM_UNAVAILABLE"],
  ] as const)("maps upstream status %s to %s", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("private upstream detail", { status }));

    await expect(
      new PhotonPublicGeocoder({ fetch: fetchMock }).search("Herzl Street"),
    ).rejects.toMatchObject({ code });
  });

  it("validates input before contacting Photon", async () => {
    await expect(new PhotonPublicGeocoder({ fetch: fetchMock }).search("x")).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
