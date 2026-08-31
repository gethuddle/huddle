"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { StyleSpecification } from "maplibre-gl";

import { Button } from "@/components/ui/button";
import type { PrivatePoint } from "@/features/locations/types";

const ISRAEL_CENTER: PrivatePoint = { latitude: 31.8, longitude: 34.9 };
const ISRAEL_BOUNDS = {
  south: 29.3,
  west: 34.2,
  north: 33.4,
  east: 35.95,
} as const;

export function isPointWithinIsrael(point: PrivatePoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= ISRAEL_BOUNDS.south &&
    point.latitude <= ISRAEL_BOUNDS.north &&
    point.longitude >= ISRAEL_BOUNDS.west &&
    point.longitude <= ISRAEL_BOUNDS.east
  );
}

export type PrivatePinMapController = Readonly<{
  destroy: () => void;
  setPin: (point: PrivatePoint) => boolean;
}>;

export type PrivatePinMapFactory = (
  container: HTMLDivElement,
  options: Readonly<{
    initialPoint: PrivatePoint | null;
    onPinMoved: (point: PrivatePoint) => void;
    onPinRejected: () => void;
  }>,
) => PrivatePinMapController | Promise<PrivatePinMapController>;

type MapPinPickerProps = Readonly<{
  initialPoint?: PrivatePoint | null;
  onChange: (point: PrivatePoint | null) => void;
  mapFactory?: PrivatePinMapFactory;
}>;

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

export const createMapLibrePrivatePinMap: PrivatePinMapFactory = async (
  container,
  { initialPoint, onPinMoved, onPinRejected },
) => {
  const maplibre = await import("maplibre-gl");
  const map = new maplibre.Map({
    container,
    style: osmStyle,
    center: [ISRAEL_CENTER.longitude, ISRAEL_CENTER.latitude],
    zoom: 7,
    minZoom: 7,
    maxZoom: 18,
    maxBounds: [
      [ISRAEL_BOUNDS.west, ISRAEL_BOUNDS.south],
      [ISRAEL_BOUNDS.east, ISRAEL_BOUNDS.north],
    ],
    renderWorldCopies: false,
    attributionControl: false,
  });
  let marker: InstanceType<typeof maplibre.Marker> | null = null;
  let lastAcceptedPoint: PrivatePoint | null = null;

  function ensureMarker(point: PrivatePoint) {
    if (marker !== null) {
      marker.setLngLat([point.longitude, point.latitude]);
      return;
    }
    marker = new maplibre.Marker({ draggable: true })
      .setLngLat([point.longitude, point.latitude])
      .addTo(map);
    marker.on("dragend", () => {
      if (marker === null) return;
      const location = marker.getLngLat();
      const point = { latitude: location.lat, longitude: location.lng };
      if (moveMarker(point)) onPinMoved(point);
    });
  }

  function moveMarker(point: PrivatePoint) {
    if (!isPointWithinIsrael(point)) {
      if (marker !== null && lastAcceptedPoint !== null) {
        marker.setLngLat([lastAcceptedPoint.longitude, lastAcceptedPoint.latitude]);
      }
      onPinRejected();
      return false;
    }
    lastAcceptedPoint = point;
    ensureMarker(point);
    return true;
  }

  map.on("click", (event) => {
    const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
    if (moveMarker(point)) onPinMoved(point);
  });

  if (initialPoint !== null) moveMarker(initialPoint);

  return { destroy: () => map.remove(), setPin: moveMarker };
};

export function MapPinPicker({
  initialPoint = null,
  onChange,
  mapFactory = createMapLibrePrivatePinMap,
}: MapPinPickerProps) {
  const inputId = useId();
  const mapInstructionsId = `${inputId}-map-instructions`;
  const mapContainer = useRef<HTMLDivElement>(null);
  const controller = useRef<PrivatePinMapController | null>(null);
  const onChangeRef = useRef(onChange);
  const selectedPoint = useRef<PrivatePoint | null>(initialPoint);
  const geolocationGeneration = useRef(0);
  const [hasPin, setHasPin] = useState(initialPoint !== null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () => () => {
      geolocationGeneration.current += 1;
    },
    [],
  );

  const rejectPoint = useCallback(() => {
    setLocationError("Choose a point in Israel.");
  }, []);

  const publishPoint = useCallback((point: PrivatePoint) => {
    selectedPoint.current = point;
    setHasPin(true);
    setLocationError(null);
    onChangeRef.current(point);
  }, []);

  useEffect(() => {
    const container = mapContainer.current;
    if (container === null) return;
    let active = true;
    let createdController: PrivatePinMapController | null = null;

    Promise.resolve(
      mapFactory(container, {
        initialPoint: selectedPoint.current,
        onPinMoved: (point) => {
          if (!active) return;
          if (!isPointWithinIsrael(point)) {
            rejectPoint();
            return;
          }
          publishPoint(point);
        },
        onPinRejected: () => {
          if (active) rejectPoint();
        },
      }),
    )
      .then((mapController) => {
        if (!active) {
          mapController.destroy();
          return;
        }
        createdController = mapController;
        controller.current = mapController;
      })
      .catch(() => {
        if (active) setMapError(true);
      });

    return () => {
      active = false;
      createdController?.destroy();
      controller.current = null;
    };
  }, [mapFactory, publishPoint, rejectPoint]);

  function selectPoint(point: PrivatePoint) {
    if (!isPointWithinIsrael(point) || controller.current?.setPin(point) === false) {
      rejectPoint();
      return;
    }
    publishPoint(point);
  }

  function useBrowserLocation() {
    const generation = geolocationGeneration.current + 1;
    geolocationGeneration.current = generation;
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Browser location is unavailable. Choose a point on the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (geolocationGeneration.current !== generation) return;
        selectPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        if (geolocationGeneration.current !== generation) return;
        setLocationError("Location permission was unavailable. Choose a point on the map instead.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function movePinWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = selectedPoint.current ?? ISRAEL_CENTER;
    const delta = 0.001;
    let next: PrivatePoint;
    switch (event.key) {
      case "ArrowUp":
        next = { latitude: current.latitude + delta, longitude: current.longitude };
        break;
      case "ArrowDown":
        next = { latitude: current.latitude - delta, longitude: current.longitude };
        break;
      case "ArrowLeft":
        next = { latitude: current.latitude, longitude: current.longitude - delta };
        break;
      case "ArrowRight":
        next = { latitude: current.latitude, longitude: current.longitude + delta };
        break;
      default:
        return;
    }
    event.preventDefault();
    selectPoint({
      latitude: Number(next.latitude.toFixed(6)),
      longitude: Number(next.longitude.toFixed(6)),
    });
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" id={`${inputId}-title`}>
          Adjust the meeting point
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the confirmed address, your current location, or move the pin anywhere in Israel.
        </p>
      </div>

      <Button onClick={useBrowserLocation} type="button" variant="outline">
        Use my current location
      </Button>

      {locationError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {locationError}
        </p>
      )}
      {mapError ? (
        <p className="text-sm text-destructive" role="alert">
          The map could not load. Use your current location or try again later.
        </p>
      ) : null}

      <div
        aria-describedby={mapInstructionsId}
        aria-label="Map for choosing a meeting point"
        className="relative h-72 overflow-hidden rounded-2xl border border-border bg-secondary [&_.maplibregl-canvas]:absolute [&_.maplibregl-canvas]:inset-0 [&_.maplibregl-marker]:absolute [&_.maplibregl-marker]:left-0 [&_.maplibregl-marker]:top-0"
        onKeyDown={movePinWithKeyboard}
        ref={mapContainer}
        role="region"
        tabIndex={0}
      />
      <p className="text-sm text-muted-foreground" id={mapInstructionsId}>
        Click the map or use the arrow keys to move the pin in small steps.
      </p>
      <p className="text-sm text-muted-foreground" role="status">
        {hasPin ? "Meeting point selected. Exact home details stay protected." : "Choose a point."}
      </p>
      <p className="text-xs text-muted-foreground">
        Map data ©{" "}
        <a
          className="underline underline-offset-2"
          href="https://www.openstreetmap.org/copyright"
          rel="noreferrer"
          target="_blank"
        >
          OpenStreetMap contributors
        </a>
        , available under the ODbL.
      </p>
    </section>
  );
}
