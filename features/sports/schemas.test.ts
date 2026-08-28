import { describe, expect, it } from "vitest";

import {
  SPORTS_SYNC_MAX_BODY_BYTES,
  sportsSyncRequestBodyIsTooLarge,
} from "@/features/sports/schemas";

describe("sports synchronization request bounds", () => {
  it("enforces the byte ceiling for ASCII request bodies", () => {
    expect(sportsSyncRequestBodyIsTooLarge("a".repeat(SPORTS_SYNC_MAX_BODY_BYTES))).toBe(false);
    expect(sportsSyncRequestBodyIsTooLarge("a".repeat(SPORTS_SYNC_MAX_BODY_BYTES + 1))).toBe(true);
  });

  it("counts UTF-8 bytes rather than JavaScript string units", () => {
    const multiByteBody = "⚽".repeat(1_500);

    expect(multiByteBody.length).toBeLessThan(SPORTS_SYNC_MAX_BODY_BYTES);
    expect(sportsSyncRequestBodyIsTooLarge(multiByteBody)).toBe(true);
  });
});
