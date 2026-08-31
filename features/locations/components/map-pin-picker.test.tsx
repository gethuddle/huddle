// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PrivatePoint } from "@/features/locations/types";

import {
  createMapLibrePrivatePinMap,
  MapPinPicker,
  type PrivatePinMapFactory,
} from "./map-pin-picker";

const maplibreMocks = vi.hoisted(() => {
  const map = { on: vi.fn(), remove: vi.fn() };
  const marker = { setLngLat: vi.fn(), addTo: vi.fn(), on: vi.fn(), getLngLat: vi.fn() };
  marker.setLngLat.mockImplementation(() => marker);
  marker.addTo.mockImplementation(() => marker);
  marker.on.mockImplementation(() => marker);
  return {
    Map: vi.fn(function Map() {
      return map;
    }),
    Marker: vi.fn(function Marker() {
      return marker;
    }),
    map,
    marker,
  };
});

vi.mock("maplibre-gl", () => ({ Map: maplibreMocks.Map, Marker: maplibreMocks.Marker }));

beforeEach(() => vi.clearAllMocks());

describe("MapPinPicker", () => {
  it("has no city or caller-supplied camera contract", () => {
    type Props = ComponentProps<typeof MapPinPicker>;
    expectTypeOf<keyof Props>().toEqualTypeOf<"initialPoint" | "onChange" | "mapFactory">();
  });

  it("accepts a point anywhere inside Israel and never renders coordinates", () => {
    let movePin: ((point: PrivatePoint) => void) | undefined;
    const onChange = vi.fn();
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      movePin = options.onPinMoved;
      return { destroy: vi.fn(), setPin: vi.fn(() => true) };
    });

    render(<MapPinPicker mapFactory={mapFactory} onChange={onChange} />);
    act(() => movePin?.({ latitude: 29.56, longitude: 34.95 }));

    expect(onChange).toHaveBeenLastCalledWith({ latitude: 29.56, longitude: 34.95 });
    expect(screen.getByRole("status")).toHaveTextContent("Meeting point selected");
    expect(document.body.textContent).not.toContain("29.56");
    expect(document.body.textContent).not.toContain("34.95");
  });

  it("rejects coordinates outside Israel without emitting them", () => {
    let movePin: ((point: PrivatePoint) => void) | undefined;
    const onChange = vi.fn();
    const mapFactory: PrivatePinMapFactory = vi.fn((_container, options) => {
      movePin = options.onPinMoved;
      return { destroy: vi.fn(), setPin: vi.fn(() => true) };
    });

    render(<MapPinPicker mapFactory={mapFactory} onChange={onChange} />);
    act(() => movePin?.({ latitude: 40.71, longitude: -74 }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a point in Israel");
  });

  it("uses browser location only after a deliberate action", async () => {
    const point = { latitude: 32.08, longitude: 34.78 };
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: point } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const setPin = vi.fn(() => true);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<MapPinPicker mapFactory={() => ({ destroy: vi.fn(), setPin })} onChange={onChange} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(setPin).toHaveBeenCalledWith(point);
    expect(onChange).toHaveBeenLastCalledWith(point);
  });

  it("starts the map at Israel bounds and replays an initial point", async () => {
    const initialPoint = { latitude: 31.77, longitude: 35.21 };
    const controller = await createMapLibrePrivatePinMap(document.createElement("div"), {
      initialPoint,
      onPinMoved: vi.fn(),
      onPinRejected: vi.fn(),
    });

    expect(maplibreMocks.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [34.9, 31.8],
        maxBounds: [
          [34.2, 29.3],
          [35.95, 33.4],
        ],
      }),
    );
    expect(maplibreMocks.marker.setLngLat).toHaveBeenCalledWith([
      initialPoint.longitude,
      initialPoint.latitude,
    ]);
    expect(controller.setPin({ latitude: 40.71, longitude: -74 })).toBe(false);
  });

  it("supports keyboard pin placement without a city seed", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MapPinPicker
        mapFactory={() => ({ destroy: vi.fn(), setPin: vi.fn(() => true) })}
        onChange={onChange}
      />,
    );

    const map = screen.getByRole("region", { name: "Map for choosing a meeting point" });
    map.focus();
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenLastCalledWith({ latitude: 31.801, longitude: 34.9 });
  });

  it("cleans up the map controller on unmount", async () => {
    const destroy = vi.fn();
    const view = render(
      <MapPinPicker
        mapFactory={() => ({ destroy, setPin: vi.fn(() => true) })}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(destroy).not.toHaveBeenCalled());
    view.unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
