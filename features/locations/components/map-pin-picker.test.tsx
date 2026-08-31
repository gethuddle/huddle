// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { findReviewedPilotCity } from "@/features/locations/pilot-cities";
import type { PrivatePoint } from "@/features/locations/types";

import {
  createMapLibrePrivatePinMap,
  MapPinPicker,
  type PrivatePinMapController,
  type PrivatePinMapFactory,
} from "./map-pin-picker";

const maplibreMocks = vi.hoisted(() => {
  const map = {
    on: vi.fn(),
    remove: vi.fn(),
    easeTo: vi.fn(),
    jumpTo: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
  };
  const marker = {
    setLngLat: vi.fn(),
    addTo: vi.fn(),
    on: vi.fn(),
    getLngLat: vi.fn(),
  };
  marker.setLngLat.mockImplementation(() => marker);
  marker.addTo.mockImplementation(() => marker);
  marker.on.mockImplementation(() => marker);
  const Map = vi.fn(function Map() {
    return map;
  });
  const Marker = vi.fn(function Marker() {
    return marker;
  });

  return { Map, Marker, map, marker };
});

vi.mock("maplibre-gl", () => ({ Map: maplibreMocks.Map, Marker: maplibreMocks.Marker }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MapPinPicker", () => {
  it("accepts only a reviewed city identifier, not caller-supplied camera coordinates", () => {
    type Props = ComponentProps<typeof MapPinPicker>;
    expectTypeOf<keyof Props>().toEqualTypeOf<"citySlug" | "onChange" | "mapFactory">();
  });

  it("keeps the protected address local while a manual map move selects a private pin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let movePin: ((point: { latitude: number; longitude: number }) => void) | undefined;
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      movePin = options.onPinMoved;
      return { destroy: vi.fn(), setPin: vi.fn() };
    });
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />);

    const privateAddress = "PRIVATE-HOME-VALUE";
    await user.type(screen.getByRole("textbox", { name: "Private address" }), privateAddress);
    act(() => movePin?.({ latitude: 32.801, longitude: 34.991 }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Private pin selected in Haifa. Exact details stay protected.",
    );
    expect(document.body.textContent).not.toContain("32.801");
    expect(document.body.textContent).not.toContain("34.991");
    expect(onChange).toHaveBeenLastCalledWith({
      addressText: privateAddress,
      point: { latitude: 32.801, longitude: 34.991 },
    });
  });

  it("uses browser location only after a deliberate action and never public-geocodes it", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 32.802, longitude: 34.992 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const setPin = vi.fn();
    const mapFactory: PrivatePinMapFactory = vi.fn(() => ({ destroy: vi.fn(), setPin }));
    const user = userEvent.setup();

    render(<MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={vi.fn()} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(setPin).toHaveBeenCalledWith({ latitude: 32.802, longitude: 34.992 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers a coordinate-free recovery state when browser location is denied", async () => {
    const getCurrentPosition = vi.fn((_success, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const user = userEvent.setup();

    render(
      <MapPinPicker
        citySlug="haifa"
        mapFactory={() => ({ destroy: vi.fn(), setPin: vi.fn() })}
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Location permission was not available. Move the pin on the map instead.",
    );
  });

  it("always displays linked OpenStreetMap attribution", () => {
    render(
      <MapPinPicker
        citySlug="haifa"
        mapFactory={() => ({ destroy: vi.fn(), setPin: vi.fn() })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });

  it("creates a fixed map from the reviewed city slug and never moves its camera for a private pin", async () => {
    const privatePoint = { latitude: 32.801, longitude: 34.991 };
    const onPinMoved = vi.fn();
    const container = document.createElement("div");
    const city = findReviewedPilotCity("haifa");
    expect(city).not.toBeNull();
    if (city === null) return;

    const controller = await createMapLibrePrivatePinMap(container, {
      city,
      onPinMoved,
      onPinRejected: vi.fn(),
    });

    expect(maplibreMocks.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [34.99928, 32.81303],
        zoom: 11,
        dragPan: false,
        scrollZoom: false,
        boxZoom: false,
        dragRotate: false,
        keyboard: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
      }),
    );

    expect(maplibreMocks.Marker).not.toHaveBeenCalled();

    controller.setPin(privatePoint);

    expect(maplibreMocks.Marker).toHaveBeenCalledOnce();
    expect(maplibreMocks.marker.setLngLat).toHaveBeenLastCalledWith([
      privatePoint.longitude,
      privatePoint.latitude,
    ]);
    expect(maplibreMocks.map.easeTo).not.toHaveBeenCalled();
    expect(maplibreMocks.map.jumpTo).not.toHaveBeenCalled();
    expect(maplibreMocks.map.setCenter).not.toHaveBeenCalled();
    expect(maplibreMocks.map.setZoom).not.toHaveBeenCalled();
  });

  it("selects a manual point inside the fixed viewport without moving the camera", async () => {
    const onPinMoved = vi.fn();
    const city = findReviewedPilotCity("haifa");
    expect(city).not.toBeNull();
    if (city === null) return;
    await createMapLibrePrivatePinMap(document.createElement("div"), {
      city,
      onPinMoved,
      onPinRejected: vi.fn(),
    });
    const clickHandler = maplibreMocks.map.on.mock.calls.find(
      ([event]) => event === "click",
    )?.[1] as ((event: { lngLat: { lat: number; lng: number } }) => void) | undefined;

    act(() => clickHandler?.({ lngLat: { lat: 32.801, lng: 34.991 } }));

    expect(onPinMoved).toHaveBeenCalledWith({ latitude: 32.801, longitude: 34.991 });
    expect(maplibreMocks.map.easeTo).not.toHaveBeenCalled();
    expect(maplibreMocks.map.jumpTo).not.toHaveBeenCalled();
    expect(maplibreMocks.map.setCenter).not.toHaveBeenCalled();
    expect(maplibreMocks.map.setZoom).not.toHaveBeenCalled();
  });

  it("replays the latest browser point when asynchronous map construction finishes", async () => {
    const point = { latitude: 32.802, longitude: 34.992 };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: point } as GeolocationPosition),
      },
    });
    const setPin = vi.fn(() => true);
    let resolveMap: ((controller: PrivatePinMapController) => void) | undefined;
    const mapFactory: PrivatePinMapFactory = vi.fn(
      () => new Promise<PrivatePinMapController>((resolve) => (resolveMap = resolve)),
    );
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(setPin).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point });

    await act(async () => {
      resolveMap?.({ destroy: vi.fn(), setPin });
      await Promise.resolve();
    });

    await waitFor(() => expect(setPin).toHaveBeenCalledWith(point));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Private pin selected in Haifa. Exact details stay protected.",
    );
  });

  it("rejects an unsupported city identifier without constructing a map or using a fallback", () => {
    const mapFactory: PrivatePinMapFactory = vi.fn(() => ({
      destroy: vi.fn(),
      setPin: vi.fn(),
    }));

    render(
      <MapPinPicker citySlug="inactive-pilot-city" mapFactory={mapFactory} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Private location selection is not available for this city.",
    );
    expect(mapFactory).not.toHaveBeenCalled();
  });

  it("does not emit or report an outside-city browser point as selected", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 33.1, longitude: 35.3 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const setPin = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <MapPinPicker
        citySlug="haifa"
        mapFactory={() => ({ destroy: vi.fn(), setPin })}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(setPin).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That point is outside Haifa. Choose the matching city or move within the fixed map.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
  });

  it("does not emit or report an outside-city manual point as selected", () => {
    let movePin: ((point: { latitude: number; longitude: number }) => void) | undefined;
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      movePin = options.onPinMoved;
      return { destroy: vi.fn(), setPin: vi.fn() };
    });
    const onChange = vi.fn();

    render(<MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />);
    act(() => movePin?.({ latitude: 33.1, longitude: 35.3 }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That point is outside Haifa. Choose the matching city or move within the fixed map.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
  });

  it("lets a denied-geolocation keyboard user select a bounded point without moving the camera", async () => {
    const getCurrentPosition = vi.fn((_success, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<MapPinPicker citySlug="haifa" onChange={onChange} />);
    await waitFor(() => expect(maplibreMocks.Map).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Location permission was not available. Move the pin on the map instead.",
    );

    const mapRegion = screen.getByRole("region", { name: "Map for choosing a private location" });
    expect(mapRegion).toHaveAccessibleDescription(
      "Focus the map and use the arrow keys to move the private pin in small steps.",
    );
    mapRegion.focus();
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenLastCalledWith({
      addressText: "",
      point: { latitude: 32.81403, longitude: 34.99928 },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Private pin selected in Haifa. Exact details stay protected.",
    );
    expect(maplibreMocks.map.easeTo).not.toHaveBeenCalled();
    expect(maplibreMocks.map.jumpTo).not.toHaveBeenCalled();
    expect(maplibreMocks.map.setCenter).not.toHaveBeenCalled();
    expect(maplibreMocks.map.setZoom).not.toHaveBeenCalled();
  });

  it("clears protected address and pin state when the reviewed city changes", async () => {
    const destroyHaifa = vi.fn();
    const setHaifaPin = vi.fn();
    const destroyAshdod = vi.fn();
    const setAshdodPin = vi.fn();
    const callbacks: Array<Parameters<PrivatePinMapFactory>[1]> = [];
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      callbacks.push(options);
      return callbacks.length === 1
        ? { destroy: destroyHaifa, setPin: setHaifaPin }
        : { destroy: destroyAshdod, setPin: setAshdodPin };
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />,
    );
    await waitFor(() => expect(callbacks).toHaveLength(1));

    await user.type(screen.getByRole("textbox", { name: "Private address" }), "Private place");
    act(() => callbacks[0]?.onPinMoved({ latitude: 32.82, longitude: 35.01 }));
    expect(screen.getByRole("status")).toHaveTextContent("Private pin selected in Haifa");

    view.rerender(<MapPinPicker citySlug="ashdod" mapFactory={mapFactory} onChange={onChange} />);

    await waitFor(() => expect(callbacks).toHaveLength(2));
    expect(screen.getByRole("textbox", { name: "Private address" })).toHaveValue("");
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
    expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point: null });
    expect(destroyHaifa).toHaveBeenCalledOnce();
    expect(setAshdodPin).not.toHaveBeenCalled();
  });

  it("destroys a delayed old-city controller without installing or replaying its point", async () => {
    let resolveOld: ((controller: PrivatePinMapController) => void) | undefined;
    const destroyOld = vi.fn();
    const setOldPin = vi.fn(() => true);
    const setNewPin = vi.fn(() => true);
    const callbacks: Array<Parameters<PrivatePinMapFactory>[1]> = [];
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      callbacks.push(options);
      if (callbacks.length === 1) {
        return new Promise<PrivatePinMapController>((resolve) => {
          resolveOld = resolve;
        });
      }
      return { destroy: vi.fn(), setPin: setNewPin };
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />,
    );
    await waitFor(() => expect(callbacks).toHaveLength(1));
    await user.type(screen.getByRole("textbox", { name: "Private address" }), "Private place");
    act(() => callbacks[0]?.onPinMoved({ latitude: 32.82, longitude: 35.01 }));

    view.rerender(<MapPinPicker citySlug="ashdod" mapFactory={mapFactory} onChange={onChange} />);
    await waitFor(() => expect(callbacks).toHaveLength(2));
    await act(async () => {
      resolveOld?.({ destroy: destroyOld, setPin: setOldPin });
      await Promise.resolve();
    });

    expect(destroyOld).toHaveBeenCalledOnce();
    expect(setOldPin).not.toHaveBeenCalled();
    expect(setNewPin).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Private address" })).toHaveValue("");
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
    expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point: null });
  });

  it("clears protected state when a valid city becomes unsupported", async () => {
    const destroy = vi.fn();
    let movePin: ((point: PrivatePoint) => void) | undefined;
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      movePin = options.onPinMoved;
      return { destroy, setPin: vi.fn() };
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />,
    );
    await user.type(screen.getByRole("textbox", { name: "Private address" }), "Private place");
    act(() => movePin?.({ latitude: 32.82, longitude: 35.01 }));

    view.rerender(
      <MapPinPicker citySlug="inactive-pilot-city" mapFactory={mapFactory} onChange={onChange} />,
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point: null }),
    );
    expect(screen.queryByRole("textbox", { name: "Private address" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(destroy).toHaveBeenCalledOnce();

    view.rerender(<MapPinPicker citySlug="ashdod" mapFactory={mapFactory} onChange={onChange} />);
    expect(await screen.findByRole("textbox", { name: "Private address" })).toHaveValue("");
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
  });

  it("clears queued protected point state when the installed controller rejects replay", async () => {
    let movePin: ((point: PrivatePoint) => void) | undefined;
    let resolveMap: ((controller: PrivatePinMapController) => void) | undefined;
    const mapFactory: PrivatePinMapFactory = vi.fn(
      (_container, options) =>
        new Promise<PrivatePinMapController>((resolve) => {
          movePin = options.onPinMoved;
          resolveMap = resolve;
        }),
    );
    const onChange = vi.fn();

    render(<MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />);
    act(() => movePin?.({ latitude: 32.82, longitude: 35.01 }));
    expect(screen.getByRole("status")).toHaveTextContent("Private pin selected in Haifa");

    await act(async () => {
      resolveMap?.({ destroy: vi.fn(), setPin: () => false });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent("selected"));
    expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point: null });
  });

  it("ignores delayed old-city geolocation success and failure after a valid city change", async () => {
    const requests: Array<{ success: PositionCallback; error: PositionErrorCallback }> = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) =>
          requests.push({ success, error }),
      },
    });
    const oldSetPin = vi.fn(() => true);
    const newSetPin = vi.fn(() => true);
    let mapCount = 0;
    const mapFactory: PrivatePinMapFactory = vi.fn(() => {
      mapCount += 1;
      return {
        destroy: vi.fn(),
        setPin: mapCount === 1 ? oldSetPin : newSetPin,
      };
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MapPinPicker citySlug="haifa" mapFactory={mapFactory} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(requests).toHaveLength(1);

    view.rerender(<MapPinPicker citySlug="ashdod" mapFactory={mapFactory} onChange={onChange} />);
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point: null }),
    );
    const callsAfterClear = onChange.mock.calls.length;

    act(() => {
      requests[0]?.success({
        coords: { latitude: 32.82, longitude: 35.01 },
      } as GeolocationPosition);
      requests[0]?.error({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
      } as GeolocationPositionError);
    });

    expect(onChange).toHaveBeenCalledTimes(callsAfterClear);
    expect(oldSetPin).not.toHaveBeenCalled();
    expect(newSetPin).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
  });

  it("ignores delayed geolocation callbacks after a valid city becomes unsupported", async () => {
    const requests: Array<{ success: PositionCallback; error: PositionErrorCallback }> = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) =>
          requests.push({ success, error }),
      },
    });
    const setPin = vi.fn(() => true);
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MapPinPicker
        citySlug="haifa"
        mapFactory={() => ({ destroy: vi.fn(), setPin })}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    view.rerender(
      <MapPinPicker
        citySlug="inactive-pilot-city"
        mapFactory={() => ({ destroy: vi.fn(), setPin })}
        onChange={onChange}
      />,
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ addressText: "", point: null }),
    );
    const callsAfterClear = onChange.mock.calls.length;

    act(() => {
      requests[0]?.success({
        coords: { latitude: 32.82, longitude: 35.01 },
      } as GeolocationPosition);
      requests[0]?.error({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
      } as GeolocationPositionError);
    });

    expect(onChange).toHaveBeenCalledTimes(callsAfterClear);
    expect(setPin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Private location selection is not available for this city.",
    );
  });

  it("ignores delayed geolocation callbacks after the picker unmounts", async () => {
    const requests: Array<{ success: PositionCallback; error: PositionErrorCallback }> = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) =>
          requests.push({ success, error }),
      },
    });
    const setPin = vi.fn(() => true);
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MapPinPicker
        citySlug="haifa"
        mapFactory={() => ({ destroy: vi.fn(), setPin })}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    view.unmount();

    act(() => {
      requests[0]?.success({
        coords: { latitude: 32.82, longitude: 35.01 },
      } as GeolocationPosition);
      requests[0]?.error({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
      } as GeolocationPositionError);
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(setPin).not.toHaveBeenCalled();
  });

  it("allows only the latest same-city geolocation request to change selection", async () => {
    const requests: Array<{ success: PositionCallback; error: PositionErrorCallback }> = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) =>
          requests.push({ success, error }),
      },
    });
    const setPin = vi.fn(() => true);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MapPinPicker
        citySlug="haifa"
        mapFactory={() => ({ destroy: vi.fn(), setPin })}
        onChange={onChange}
      />,
    );
    await act(async () => Promise.resolve());
    const locationButton = screen.getByRole("button", { name: "Use my current location" });
    await user.click(locationButton);
    await user.click(locationButton);
    expect(requests).toHaveLength(2);

    act(() => {
      requests[0]?.success({
        coords: { latitude: 32.82, longitude: 35.01 },
      } as GeolocationPosition);
      requests[0]?.error({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
      } as GeolocationPositionError);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(setPin).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => {
      requests[1]?.success({
        coords: { latitude: 32.82, longitude: 35.01 },
      } as GeolocationPosition);
    });

    expect(onChange).toHaveBeenLastCalledWith({
      addressText: "",
      point: { latitude: 32.82, longitude: 35.01 },
    });
    expect(setPin).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Private pin selected in Haifa");
  });
});
