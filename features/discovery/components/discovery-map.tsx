"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";

import type { DiscoveryEvent } from "@/features/discovery/types";
import { loadMapLibreRuntime } from "@/features/locations/maplibre-runtime";
import { formatIsraelKickoff } from "@/features/sports/time";

type UserLocation = Readonly<{ lat: number; lng: number }>;

export type DiscoveryMapLocation = Readonly<{
  id: string;
  placeName: string;
  latitude: number;
  longitude: number;
  events: readonly DiscoveryEvent[];
}>;

export type DiscoveryMapController = Readonly<{
  destroy: () => void;
  selectLocation: (locationId: string) => void;
}>;

export type DiscoveryMapFactory = (
  container: HTMLDivElement,
  options: Readonly<{
    locations: readonly DiscoveryMapLocation[];
    userLocation: UserLocation | null;
    onLocationSelect: (locationId: string) => void;
  }>,
) => DiscoveryMapController | Promise<DiscoveryMapController>;

const osmStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function markerLabel(location: DiscoveryMapLocation) {
  return location.events.length === 1 ? "1 game" : `${location.events.length} games`;
}

export const createMapLibreDiscoveryMap: DiscoveryMapFactory = async (
  container,
  { locations, onLocationSelect, userLocation },
) => {
  const maplibre = await loadMapLibreRuntime();
  const firstLocation = locations[0];
  if (firstLocation === undefined) throw new Error("A discovery map needs a public location.");
  const center: [number, number] = userLocation
    ? [userLocation.lng, userLocation.lat]
    : [firstLocation.longitude, firstLocation.latitude];
  const map = new maplibre.Map({
    container,
    style: osmStyle,
    center,
    zoom: locations.length === 1 ? 13 : 11,
    minZoom: 6,
    maxZoom: 18,
    renderWorldCopies: false,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

  const markerElements = new Map<string, HTMLButtonElement>();
  const markers = locations.map((location) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = markerLabel(location);
    element.setAttribute(
      "aria-label",
      `${location.placeName}, ${markerLabel(location)}. Show fixtures.`,
    );
    element.className =
      "h-10 min-w-16 rounded-full border-2 border-white bg-background px-3 text-sm font-bold text-foreground [box-shadow:var(--shadow-search)] transition hover:bg-court hover:text-ink";
    element.addEventListener("click", () => onLocationSelect(location.id));
    markerElements.set(location.id, element);
    return new maplibre.Marker({ element, anchor: "bottom" })
      .setLngLat([location.longitude, location.latitude])
      .addTo(map);
  });

  let userMarker: InstanceType<typeof maplibre.Marker> | null = null;
  if (userLocation !== null) {
    const element = document.createElement("span");
    element.setAttribute("aria-label", "Your current browser location");
    element.className =
      "block size-4 rounded-full border-[3px] border-white bg-blue-500 shadow-[0_0_0_5px_rgba(59,130,246,0.25)]";
    userMarker = new maplibre.Marker({ element })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }

  map.on("load", () => {
    const points = locations.map(
      (location) => [location.longitude, location.latitude] as [number, number],
    );
    if (userLocation !== null) points.push([userLocation.lng, userLocation.lat]);
    if (points.length > 1) {
      const longitudes = points.map(([longitude]) => longitude);
      const latitudes = points.map(([, latitude]) => latitude);
      map.fitBounds(
        [
          [Math.min(...longitudes), Math.min(...latitudes)],
          [Math.max(...longitudes), Math.max(...latitudes)],
        ],
        { padding: 64, maxZoom: 14, duration: 0 },
      );
    }
  });

  return {
    destroy: () => {
      for (const marker of markers) marker.remove();
      userMarker?.remove();
      map.remove();
    },
    selectLocation: (locationId) => {
      for (const [id, element] of markerElements) {
        const selected = id === locationId;
        element.classList.toggle("bg-court", selected);
        element.classList.toggle("text-ink", selected);
        element.classList.toggle("bg-background", !selected);
        element.classList.toggle("text-foreground", !selected);
        element.setAttribute("aria-pressed", String(selected));
      }
      const location = locations.find((candidate) => candidate.id === locationId);
      if (location !== undefined) {
        map.easeTo({
          center: [location.longitude, location.latitude],
          zoom: Math.max(map.getZoom(), 13),
          duration: 350,
        });
      }
    },
  };
};

function groupPublicLocations(events: readonly DiscoveryEvent[]) {
  const grouped = new Map<string, DiscoveryMapLocation>();
  for (const event of events) {
    const point = event.mapPoint;
    if (point === null || event.placeKind === "home") continue;
    const key = `${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}:${point.placeName}`;
    const current = grouped.get(key);
    grouped.set(key, {
      id: key,
      placeName: point.placeName,
      latitude: point.latitude,
      longitude: point.longitude,
      events: current === undefined ? [event] : [...current.events, event],
    });
  }
  return [...grouped.values()];
}

export function DiscoveryMap({
  events,
  mapFactory = createMapLibreDiscoveryMap,
  userLocation,
}: Readonly<{
  events: readonly DiscoveryEvent[];
  userLocation: UserLocation | null;
  mapFactory?: DiscoveryMapFactory;
}>) {
  const locations = useMemo(() => groupPublicLocations(events), [events]);
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id ?? "");
  const [mapError, setMapError] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<DiscoveryMapController | null>(null);
  const activeSelectedLocationId = locations.some((location) => location.id === selectedLocationId)
    ? selectedLocationId
    : (locations[0]?.id ?? "");
  const selectedLocation =
    locations.find((location) => location.id === activeSelectedLocationId) ?? null;

  useEffect(() => {
    const mapContainer = container.current;
    if (mapContainer === null || locations.length === 0) return;
    let active = true;
    let created: DiscoveryMapController | null = null;
    setMapError(false);
    Promise.resolve(
      mapFactory(mapContainer, {
        locations,
        userLocation,
        onLocationSelect: setSelectedLocationId,
      }),
    )
      .then((nextController) => {
        if (!active) {
          nextController.destroy();
          return;
        }
        created = nextController;
        controller.current = nextController;
        nextController.selectLocation(activeSelectedLocationId);
      })
      .catch(() => {
        if (active) setMapError(true);
      });
    return () => {
      active = false;
      created?.destroy();
      controller.current = null;
    };
    // A selected marker is updated by the small effect below; rebuilding would lose map state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, mapFactory, userLocation]);

  useEffect(() => {
    if (activeSelectedLocationId !== "") {
      controller.current?.selectLocation(activeSelectedLocationId);
    }
  }, [activeSelectedLocationId]);

  if (locations.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-[1.75rem] border border-border bg-card p-8 text-center">
        <div>
          <MapPin aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-semibold text-foreground">
            No public Venue or public-place pins yet.
          </p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
            Home events stay off the map. Try a wider search to find public places showing games.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Nearby places showing games"
      className="relative min-h-[32rem] overflow-hidden rounded-[1.75rem] border border-border bg-card"
    >
      <div className="absolute inset-0">
        <div
          aria-label="Map of public places showing games"
          className="h-full w-full [&_.maplibregl-canvas]:absolute [&_.maplibregl-canvas]:inset-0"
          ref={container}
          role="application"
        />
      </div>
      {mapError ? (
        <div
          className="absolute inset-0 grid place-items-center bg-card p-8 text-center"
          role="alert"
        >
          <div>
            <p className="font-semibold text-foreground">The map could not load.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The nearby event list still contains the same public places.
            </p>
          </div>
        </div>
      ) : null}
      {selectedLocation === null ? null : (
        <div className="absolute inset-x-3 bottom-3 max-h-[46%] overflow-y-auto rounded-2xl border border-border bg-background/95 p-4 [box-shadow:var(--shadow-floating)] backdrop-blur sm:inset-x-5 sm:bottom-5 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-forest">Showing here</p>
              <h3 className="mt-1 text-xl font-semibold text-foreground">
                {selectedLocation.placeName}
              </h3>
            </div>
            <span className="rounded-full border border-input px-3 py-1 text-xs font-semibold text-muted-foreground">
              {markerLabel(selectedLocation)}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-border-dark">
            {selectedLocation.events.slice(0, 3).map((event) => (
              <li className="py-3" key={event.id}>
                <Link
                  className="block font-semibold text-foreground outline-none hover:text-forest focus-visible:text-forest"
                  href={`/events/${event.id}`}
                >
                  {event.match.homeTeamName} vs {event.match.awayTeamName}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatIsraelKickoff(event.startsAt)} ·{" "}
                  {event.attendanceMode === "open_door" ? "Walk in" : "Reservations"}
                </p>
              </li>
            ))}
          </ul>
          {selectedLocation.events.length > 3 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              +{selectedLocation.events.length - 3} more games at this place
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
