import { describe, expect, it, vi } from "vitest";

import {
  createAssistedDiscoveryNamedOriginResolver,
  type NamedOriginProvider,
} from "./named-origin";

describe("createAssistedDiscoveryNamedOriginResolver", () => {
  it("uses a deterministic no-network Jerusalem origin for the local Playwright seam", async () => {
    const provider: NamedOriginProvider = vi.fn();
    const resolve = createAssistedDiscoveryNamedOriginResolver(
      {
        environment: "local",
        accountId: "local-playwright-fake-account",
        apiToken: "local-playwright-fake-no-network-token",
      },
      provider,
    );

    await expect(resolve("Jerusalem")).resolves.toEqual({
      origin: { lat: 31.778, lng: 35.225 },
      label: "Jerusalem, Israel",
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("maps the first bounded provider suggestion and returns null when none exists", async () => {
    const provider = vi
      .fn<NamedOriginProvider>()
      .mockResolvedValueOnce([
        {
          id: "city:haifa",
          label: "Haifa, Israel",
          latitude: 32.794,
          longitude: 34.99,
        },
      ])
      .mockResolvedValueOnce([]);
    const resolve = createAssistedDiscoveryNamedOriginResolver(
      { environment: "production", accountId: "account", apiToken: "token" },
      provider,
    );

    await expect(resolve("Haifa")).resolves.toEqual({
      origin: { lat: 32.794, lng: 34.99 },
      label: "Haifa, Israel",
    });
    await expect(resolve("Unknown place")).resolves.toBeNull();
  });
});
