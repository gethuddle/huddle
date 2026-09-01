import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import NewVenuePage from "./page";

describe("NewVenuePage", () => {
  it("routes the legacy creation URL into the two-phase Venue onboarding", async () => {
    await NewVenuePage();

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding/venue");
  });
});
