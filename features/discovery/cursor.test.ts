import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";

import {
  cursorFilterKey,
  decodeEventCursor,
  decodeGroupCursor,
  encodeEventCursor,
  encodeGroupCursor,
} from "./cursor";

const secret = "a-dedicated-test-cursor-secret-value";
const filterKey = cursorFilterKey({ city: "haifa", radiusKm: 15 });

describe("signed discovery cursors", () => {
  it("round-trips a group keyset without exposing raw JSON", () => {
    const cursor = encodeGroupCursor(
      {
        filterKey,
        name: "haifa supporters",
        id: "70000000-0000-4000-8000-000000000001",
      },
      secret,
    );

    expect(cursor).not.toContain("haifa supporters");
    expect(decodeGroupCursor(cursor, secret)).toMatchObject({
      kind: "groups",
      filterKey,
      name: "haifa supporters",
    });
  });

  it("round-trips the complete deterministic event keyset", () => {
    const cursor = encodeEventCursor(
      {
        filterKey,
        interestScore: 12,
        distanceBand: 1,
        startsAt: "2026-09-01T17:00:00.000Z",
        id: "70000000-0000-4000-8000-000000000002",
      },
      secret,
    );

    expect(decodeEventCursor(cursor, secret)).toEqual({
      version: 1,
      kind: "events",
      filterKey,
      interestScore: 12,
      distanceBand: 1,
      startsAt: "2026-09-01T17:00:00.000Z",
      id: "70000000-0000-4000-8000-000000000002",
    });
  });

  it("rejects tampering, the wrong secret, and a cursor from another endpoint", () => {
    const cursor = encodeGroupCursor(
      {
        filterKey,
        name: "group name",
        id: "70000000-0000-4000-8000-000000000003",
      },
      secret,
    );
    const [payload, suppliedSignature] = cursor.split(".");
    const tamperedSignature = `${suppliedSignature?.startsWith("a") ? "b" : "a"}${suppliedSignature?.slice(1)}`;

    expect(() => decodeGroupCursor(`${payload}.${tamperedSignature}`, secret)).toThrowError(
      DomainError,
    );
    expect(() => decodeGroupCursor(cursor, "another-dedicated-cursor-secret-value")).toThrowError(
      DomainError,
    );
    expect(() => decodeEventCursor(cursor, secret)).toThrowError(DomainError);
  });

  it("binds filter keys to the normalized filter values", () => {
    expect(cursorFilterKey({ city: "haifa", radiusKm: 15 })).toBe(filterKey);
    expect(cursorFilterKey({ city: "haifa", radiusKm: 30 })).not.toBe(filterKey);
  });
});
