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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  findReviewedPilotCity,
  isPointWithinReviewedPilotCity,
  type ReviewedPilotCity,
} from "@/features/locations/pilot-cities";
import type { PrivateLocationSelection, PrivatePoint } from "@/features/locations/types";

export type PrivatePinMapController = Readonly<{
  destroy: () => void;
  setPin: (point: PrivatePoint) => boolean;
}>;

export type PrivatePinMapFactory = (
  container: HTMLDivElement,
  options: Readonly<{
    city: ReviewedPilotCity;
    onPinMoved: (point: PrivatePoint) => void;
    onPinRejected: () => void;
  }>,
) => PrivatePinMapController | Promise<PrivatePinMapController>;

type MapPinPickerProps = Readonly<{
  /** Active public catalog slug; camera coordinates are resolved internally. */
  citySlug: string;
  onChange: (selection: PrivateLocationSelection) => void;
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
  { city, onPinMoved, onPinRejected },
) => {
  const maplibre = await import("maplibre-gl");
  const publicCityCenter = city.center;
  const map = new maplibre.Map({
    container,
    style: osmStyle,
    center: [publicCityCenter.longitude, publicCityCenter.latitude],
    zoom: 11,
    minZoom: 11,
    maxZoom: 11,
    bearing: 0,
    pitch: 0,
    boxZoom: false,
    doubleClickZoom: false,
    dragPan: false,
    dragRotate: false,
    keyboard: false,
    scrollZoom: false,
    touchPitch: false,
    touchZoomRotate: false,
    pitchWithRotate: false,
    renderWorldCopies: false,
    attributionControl: false,
  });
  let marker: InstanceType<typeof maplibre.Marker> | null = null;
  let lastAcceptedPoint: PrivatePoint | null = null;

  function ensureMarker(point: PrivatePoint) {
    if (marker !== null) {
      marker.setLngLat([point.longitude, point.latitude]);
      return marker;
    }

    marker = new maplibre.Marker({ draggable: true })
      .setLngLat([point.longitude, point.latitude])
      .addTo(map);
    marker.on("dragend", () => {
      if (marker === null) return;
      const point = marker.getLngLat();
      const selection = { latitude: point.lat, longitude: point.lng };
      if (moveMarker(selection)) onPinMoved(selection);
    });
    return marker;
  }

  function moveMarker(point: PrivatePoint) {
    if (!isPointWithinReviewedPilotCity(city, point)) {
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

  return {
    destroy: () => map.remove(),
    setPin: moveMarker,
  };
};

export function MapPinPicker({
  citySlug,
  onChange,
  mapFactory = createMapLibrePrivatePinMap,
}: MapPinPickerProps) {
  const unavailableId = useId();
  const previousCitySlug = useRef<string | null | undefined>(undefined);
  const city = findReviewedPilotCity(citySlug);
  const activeCitySlug = city?.slug ?? null;

  useEffect(() => {
    const previous = previousCitySlug.current;
    if (previous !== undefined && previous !== null && previous !== activeCitySlug) {
      onChange({ addressText: "", point: null });
    }
    previousCitySlug.current = activeCitySlug;
  }, [activeCitySlug, onChange]);

  if (city === null) {
    return (
      <section aria-labelledby={`${unavailableId}-title`} className="space-y-2">
        <h2 className="text-lg font-semibold" id={`${unavailableId}-title`}>
          Set the private meeting point
        </h2>
        <p className="text-sm text-destructive" role="alert">
          Private location selection is not available for this city.
        </p>
      </section>
    );
  }

  return (
    <CityScopedMapPinPicker
      city={city}
      key={city.slug}
      mapFactory={mapFactory}
      onChange={onChange}
    />
  );
}

type CityScopedMapPinPickerProps = Readonly<{
  city: ReviewedPilotCity;
  onChange: (selection: PrivateLocationSelection) => void;
  mapFactory: PrivatePinMapFactory;
}>;

function CityScopedMapPinPicker({ city, onChange, mapFactory }: CityScopedMapPinPickerProps) {
  const inputId = useId();
  const mapInstructionsId = `${inputId}-map-instructions`;
  const mapContainer = useRef<HTMLDivElement>(null);
  const controller = useRef<PrivatePinMapController | null>(null);
  const onChangeRef = useRef(onChange);
  const addressText = useRef("");
  const selectedPoint = useRef<PrivatePoint | null>(null);
  const geolocationGeneration = useRef(0);
  const [hasPin, setHasPin] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);

  const publishSelection = useCallback((nextAddress: string, nextPoint: PrivatePoint | null) => {
    addressText.current = nextAddress;
    selectedPoint.current = nextPoint;
    onChangeRef.current({ addressText: nextAddress, point: nextPoint });
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () => () => {
      geolocationGeneration.current += 1;
    },
    [],
  );

  const rejectSelectedPoint = useCallback(() => {
    const hadSelectedPoint = selectedPoint.current !== null;
    selectedPoint.current = null;
    setHasPin(false);
    setLocationError(
      `That point is outside ${city.label}. Choose the matching city or move within the fixed map.`,
    );
    if (hadSelectedPoint) publishSelection(addressText.current, null);
  }, [city.label, publishSelection]);

  useEffect(() => {
    const container = mapContainer.current;
    if (container === null) return;

    let active = true;
    let createdController: PrivatePinMapController | null = null;
    Promise.resolve(
      mapFactory(container, {
        city,
        onPinMoved: (point) => {
          if (!active) return;
          if (!isPointWithinReviewedPilotCity(city, point)) {
            rejectSelectedPoint();
            return;
          }
          setHasPin(true);
          setLocationError(null);
          publishSelection(addressText.current, point);
        },
        onPinRejected: () => {
          if (!active) return;
          rejectSelectedPoint();
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
        const queuedPoint = selectedPoint.current;
        if (queuedPoint !== null && mapController.setPin(queuedPoint) === false) {
          if (selectedPoint.current !== null) rejectSelectedPoint();
        }
      })
      .catch(() => {
        if (active) setMapError(true);
      });

    return () => {
      active = false;
      createdController?.destroy();
      controller.current = null;
    };
  }, [city, mapFactory, publishSelection, rejectSelectedPoint]);

  function selectProtectedPoint(point: PrivatePoint) {
    if (!isPointWithinReviewedPilotCity(city, point)) {
      rejectSelectedPoint();
      return;
    }

    if (controller.current?.setPin(point) === false) {
      if (selectedPoint.current !== null) rejectSelectedPoint();
      return;
    }
    setHasPin(true);
    setLocationError(null);
    publishSelection(addressText.current, point);
  }

  function useBrowserLocation() {
    const requestGeneration = geolocationGeneration.current + 1;
    geolocationGeneration.current = requestGeneration;
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Browser location is not available. Move the pin on the map instead.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (geolocationGeneration.current !== requestGeneration) return;
        selectProtectedPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        if (geolocationGeneration.current !== requestGeneration) return;
        setLocationError("Location permission was not available. Move the pin on the map instead.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function movePinWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta = 0.001;
    const current = selectedPoint.current ?? city.center;
    let next: PrivatePoint | null = null;

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
    selectProtectedPoint({
      latitude: Number(next.latitude.toFixed(6)),
      longitude: Number(next.longitude.toFixed(6)),
    });
  }

  return (
    <section className="space-y-4" aria-labelledby={`${inputId}-title`}>
      <div>
        <h2 className="text-lg font-semibold" id={`${inputId}-title`}>
          Set the private meeting point
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Huddle does not send this private address or pin through public address search.
        </p>
      </div>

      <div>
        <Label htmlFor={inputId}>Private address</Label>
        <Input
          autoComplete="street-address"
          className="mt-2"
          id={inputId}
          maxLength={300}
          onChange={(event) => publishSelection(event.currentTarget.value, selectedPoint.current)}
          required
        />
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
          The map could not load. You can still use your current location, or try again later.
        </p>
      ) : null}

      <div
        aria-describedby={mapInstructionsId}
        aria-label="Map for choosing a private location"
        className="relative h-72 overflow-hidden rounded-2xl border border-border bg-secondary [&_.maplibregl-canvas]:absolute [&_.maplibregl-canvas]:inset-0 [&_.maplibregl-marker]:absolute [&_.maplibregl-marker]:left-0 [&_.maplibregl-marker]:top-0"
        onKeyDown={movePinWithKeyboard}
        ref={mapContainer}
        role="region"
        tabIndex={0}
      />

      <p className="text-sm text-muted-foreground" id={mapInstructionsId}>
        Focus the map and use the arrow keys to move the private pin in small steps.
      </p>

      <p className="text-sm text-muted-foreground" role="status">
        {locationError !== null
          ? `Choose the matching city or move within the fixed ${city.label} map.`
          : hasPin
            ? `Private pin selected in ${city.label}. Exact details stay protected.`
            : `Click within the fixed ${city.label} map to place a pin, use the arrow keys, or use your current location.`}
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
