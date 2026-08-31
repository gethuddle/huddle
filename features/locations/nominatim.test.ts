import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { NominatimPublicGeocoder } from "./nominatim";

const validResult = {
  place_id: 101,
  display_name: "10 Herzl Street, Haifa, Israel",
  lat: "32.815",
  lon: "34.989",
  address: { city: "Haifa", country_code: "il" },
};

describe("NominatimPublicGeocoder", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([validResult]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("sends one bounded Israel-only request with a descriptive Huddle user agent", async () => {
    const geocoder = new NominatimPublicGeocoder({ fetch: fetchMock });

    await expect(geocoder.search("10 Herzl Street")).resolves.toEqual([
      {
        id: "101",
        label: "10 Herzl Street, Haifa, Israel",
        latitude: 32.815,
        longitude: 34.989,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [request, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(request.origin + request.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(request.searchParams.get("q")).toBe("10 Herzl Street, Israel");
    expect(request.searchParams.get("countrycodes")).toBe("il");
    expect(request.searchParams.get("format")).toBe("jsonv2");
    expect(request.searchParams.get("addressdetails")).toBe("1");
    expect(request.searchParams.get("bounded")).toBe("1");
    expect(request.searchParams.get("limit")).toBe("5");
    expect(request.searchParams.get("viewbox")).toBeTruthy();
    expect(new Headers(init.headers).get("user-agent")).toMatch(/^Huddle\//);
  });

  it("filters non-Israel rows and never returns more than five suggestions", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          { ...validResult, place_id: 1 },
          { ...validResult, place_id: 2 },
          { ...validResult, place_id: 3 },
          { ...validResult, place_id: 4 },
          { ...validResult, place_id: 5 },
          { ...validResult, place_id: 6 },
          {
            ...validResult,
            place_id: 7,
            display_name: "Outside Israel",
            address: { city: "Amman", country_code: "jo" },
          },
        ]),
        { status: 200 },
      ),
    );

    const results = await new NominatimPublicGeocoder({ fetch: fetchMock }).search("Herzl Street");

    expect(results).toHaveLength(5);
    expect(results.map((result) => result.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(results).not.toContainEqual(expect.objectContaining({ label: "Outside Israel" }));
  });

  it("validates query bounds before making an upstream request", async () => {
    const geocoder = new NominatimPublicGeocoder({ fetch: fetchMock });

    await expect(geocoder.search("a")).rejects.toBeInstanceOf(DomainError);
    await expect(geocoder.search("x".repeat(161))).rejects.toBeInstanceOf(DomainError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when an upstream row has an invalid coordinate or shape", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ ...validResult, lat: "exact-private-value" }]), {
        status: 200,
      }),
    );

    await expect(
      new NominatimPublicGeocoder({ fetch: fetchMock }).search("Herzl Street"),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it.each([
    [429, "RATE_LIMITED"],
    [503, "UPSTREAM_UNAVAILABLE"],
  ] as const)("maps upstream status %s to %s", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("provider detail that must stay private", { status }));

    await expect(
      new NominatimPublicGeocoder({ fetch: fetchMock }).search("Herzl Street"),
    ).rejects.toMatchObject({ code });
  });

  it("maps an abort timeout without returning the upstream error text", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("sensitive upstream request detail", "AbortError"),
    );

    try {
      await new NominatimPublicGeocoder({ fetch: fetchMock, timeoutMs: 10 }).search("Herzl Street");
      expect.unreachable("the timeout should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
      expect(String(error)).not.toContain("sensitive upstream request detail");
    }
  });
});
