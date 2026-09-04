// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileHandleField } from "./profile-handle-field";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("clears a prior save collision only after editing the normalized failed username", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true }))),
  );
  render(
    <ProfileHandleField
      defaultValue="failed_name"
      currentHandle="own_name"
      errors={["This username was claimed before you saved."]}
    />,
  );
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "FAILED_NAME" } });
  expect(screen.getByText("This username was claimed before you saved.")).toBeVisible();
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "corrected_name" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(screen.getByRole("status")).toHaveTextContent("Username available");
  expect(screen.queryByText("This username was claimed before you saved.")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Handle")).not.toHaveAttribute("aria-invalid");
});

it("debounces normalized exact usernames and displays advisory availability", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true })));
  vi.stubGlobal("fetch", fetcher);
  render(<ProfileHandleField defaultValue="" currentHandle="" />);
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "  Match_Fan " } });
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Checking");
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/profiles/handle-availability?handle=match_fan",
    expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Username available");
  expect(screen.getByRole("status")).toHaveClass("text-forest");
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "match_fan" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(screen.getByRole("status")).toHaveTextContent("Username available");
  expect(fetcher).toHaveBeenCalledOnce();
});

it("aborts stale requests and never replaces newer availability with an old response", async () => {
  const first = Promise.withResolvers<Response>();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(new Response(JSON.stringify({ available: false })));
  vi.stubGlobal("fetch", fetcher);
  render(<ProfileHandleField defaultValue="" currentHandle="" />);
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "first_name" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "second_name" } });
  expect(signal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(300));
  await act(async () => first.resolve(new Response(JSON.stringify({ available: true }))));
  expect(screen.getByRole("status")).toHaveTextContent("already taken");
  expect(screen.getByRole("status")).toHaveClass("text-destructive");
  expect(screen.getByLabelText("Handle")).toHaveAttribute("aria-invalid", "true");
});

it("avoids requests for the current or invalid handle and fails safely on lookup errors", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ProfileHandleField defaultValue="fan_one" currentHandle="fan_one" />);
  expect(screen.getByRole("status")).toHaveTextContent("current username");
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "a!" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.input(screen.getByLabelText("Handle"), { target: { value: "new_name" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(screen.getByRole("status")).toHaveTextContent("checked when you save");
  view.unmount();
  expect((fetcher.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true);
});
