// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { VenueSlugField } from "./venue-slug-field";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("debounces exact editable venue slugs and makes availability advisory", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true })));
  vi.stubGlobal("fetch", fetcher);
  render(
    <VenueSlugField
      currentSlug="match-corner"
      defaultValue="match-corner"
      venueId="e4000000-0000-4000-8000-000000000101"
    />,
  );

  expect(screen.getByText("This is your page on Huddle, not your business website.")).toBeVisible();
  expect(screen.getByText("/venues/match-corner")).toBeVisible();
  expect(screen.getByLabelText("Huddle page address")).toHaveAccessibleDescription(
    /Your Huddle page: \/venues\/match-corner/,
  );
  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "new-corner" },
  });
  expect(screen.getByText("/venues/new-corner")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Checking");
  await act(() => vi.advanceTimersByTimeAsync(300));

  expect(fetcher).toHaveBeenCalledWith(
    "/api/venues/slug-availability?venueId=e4000000-0000-4000-8000-000000000101&slug=new-corner",
    expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("available");
  expect(screen.getByRole("status")).toHaveClass("text-forest");
  expect(screen.getByText(/reserved only when you save/i)).toBeVisible();
});

it("uses the destructive status token when the editable Huddle page address is unavailable", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: false })));
  vi.stubGlobal("fetch", fetcher);
  render(
    <VenueSlugField
      currentSlug="match-corner"
      defaultValue="match-corner"
      venueId="e4000000-0000-4000-8000-000000000101"
    />,
  );

  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "taken-corner" },
  });
  await act(() => vi.advanceTimersByTimeAsync(300));

  expect(screen.getByRole("status")).toHaveTextContent("already taken");
  expect(screen.getByRole("status")).toHaveClass("text-destructive");
});

it("wraps the longest valid Huddle page path instead of overflowing a narrow viewport", () => {
  render(
    <VenueSlugField
      currentSlug="match-corner"
      defaultValue={"a".repeat(60)}
      venueId="e4000000-0000-4000-8000-000000000101"
    />,
  );

  expect(screen.getByText(`/venues/${"a".repeat(60)}`)).toHaveClass("break-all");
});

it("clears a prior result while a changed page address is checked again", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ available: false })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ available: true })));
  vi.stubGlobal("fetch", fetcher);
  render(
    <VenueSlugField
      currentSlug="match-corner"
      defaultValue="match-corner"
      venueId="e4000000-0000-4000-8000-000000000101"
    />,
  );

  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "taken-corner" },
  });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(screen.getByRole("status")).toHaveTextContent("already taken");

  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "other-corner" },
  });
  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "taken-corner" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("Checking availability");
  expect(screen.getByRole("status")).not.toHaveTextContent("already taken");
});

it("drops a stale server collision error after an edit and fails safely for an aborted lookup", async () => {
  const first = Promise.withResolvers<Response>();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new Error("Offline"));
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <VenueSlugField
      currentSlug="match-corner"
      defaultValue="taken-corner"
      errors={["That Huddle page address is already taken."]}
      venueId="e4000000-0000-4000-8000-000000000101"
    />,
  );

  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "first-corner" },
  });
  await act(() => vi.advanceTimersByTimeAsync(300));
  const firstSignal = fetcher.mock.calls[0]?.[1].signal as AbortSignal;
  fireEvent.input(screen.getByLabelText("Huddle page address"), {
    target: { value: "available-corner" },
  });
  expect(firstSignal.aborted).toBe(true);
  expect(screen.getByLabelText("Huddle page address")).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText("That Huddle page address is already taken.")).not.toBeInTheDocument();

  await act(() => vi.advanceTimersByTimeAsync(300));
  await act(async () => first.resolve(new Response(JSON.stringify({ available: true }))));
  expect(screen.getByRole("status")).toHaveTextContent("checked when you save");
  const secondSignal = fetcher.mock.calls[1]?.[1].signal as AbortSignal;
  view.unmount();
  expect(secondSignal.aborted).toBe(true);
});
