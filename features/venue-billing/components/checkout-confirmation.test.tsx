// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CheckoutConfirmation } from "./checkout-confirmation";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  vi.useRealTimers();
  refresh.mockClear();
});
it("refreshes locally for a bounded minute and then preserves a safe billing return", () => {
  vi.useFakeTimers();
  const { unmount } = render(<CheckoutConfirmation billingHref="/venues/test/workspace/billing" />);
  act(() => vi.advanceTimersByTime(2000));
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(58000));
  const count = refresh.mock.calls.length;
  act(() => vi.advanceTimersByTime(60000));
  expect(refresh).toHaveBeenCalledTimes(count);
  expect(screen.getByText(/still confirming/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /billing/i })).toHaveAttribute(
    "href",
    "/venues/test/workspace/billing",
  );
  unmount();
});
