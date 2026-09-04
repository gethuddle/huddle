// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import EmailChangeResultPage from "./page";
const mocks = vi.hoisted(() => ({ get: vi.fn(), consume: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get }) }));
vi.mock("@/features/auth/session-cleanup-actions", () => ({
  consumeHuddleSessionCleanupAction: mocks.consume,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReturnValue(undefined);
  mocks.consume.mockResolvedValue(undefined);
  window.sessionStorage.clear();
});
it.each(["received", "expired"])(
  "clears only Huddle state on marker-backed %s without claiming completed verification",
  async (status) => {
    mocks.get.mockReturnValue({ value: "sign-out" });
    window.sessionStorage.setItem("huddle:discovery-origin", "private-location");
    window.sessionStorage.setItem("huddle:onboarding:actor:fan:v1", "private-draft");
    window.sessionStorage.setItem("unrelated", "keep");
    render(await EmailChangeResultPage({ searchParams: Promise.resolve({ status }) }));
    await waitFor(() => expect(mocks.consume).toHaveBeenCalledWith("sign-out"));
    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBeNull();
    expect(window.sessionStorage.getItem("huddle:onboarding:actor:fan:v1")).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("keep");
    expect(screen.getByText(/does not sign you in or confirm that both/i)).toBeVisible();
  },
);
it("does not clear storage just because an untrusted URL claims confirmation", async () => {
  window.sessionStorage.setItem("huddle:discovery-origin", "keep");
  render(await EmailChangeResultPage({ searchParams: Promise.resolve({ status: "received" }) }));
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBe("keep");
});
