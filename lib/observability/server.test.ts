import { afterEach, describe, expect, it, vi } from "vitest";

import { safeLog } from "./server";

describe("safeLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits only allowlisted bounded operational fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const unsafeContext = {
      requestId: "r".repeat(300),
      route: "/api/discovery",
      outcome: "succeeded",
      itemCount: 4,
      quotaRemaining: 8,
      retryCount: 1,
      // Runtime filtering protects against an accidentally widened caller.
      address_text: "must-never-log",
    } as unknown as Parameters<typeof safeLog>[2];

    safeLog("info", "route complete!", unsafeContext);

    expect(info).toHaveBeenCalledWith("route_complete_", {
      requestId: "r".repeat(200),
      route: "/api/discovery",
      outcome: "succeeded",
      itemCount: 4,
      quotaRemaining: 8,
      retryCount: 1,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("must-never-log");
  });
});
