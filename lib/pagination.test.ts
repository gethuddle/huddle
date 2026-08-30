import { describe, expect, it } from "vitest";

import {
  boundedPage,
  collectionPageInput,
  collectionHasOverflow,
  collectionOffset,
  collectionPageCount,
  collectionVisibleTotal,
  MAX_COLLECTION_ITEMS,
  MAX_COLLECTION_PAGE,
} from "./pagination";

describe("bounded collection pagination", () => {
  it("advertises only pages that fit the documented RPC offset window", () => {
    expect(MAX_COLLECTION_ITEMS).toBe(10_020);
    expect(MAX_COLLECTION_PAGE).toBe(501);
    expect(collectionPageCount(10_020)).toBe(501);
    expect(collectionPageCount(10_021)).toBe(501);
    expect(collectionVisibleTotal(10_021)).toBe(10_020);
    expect(collectionHasOverflow(10_021)).toBe(true);
    expect(collectionOffset(501)).toBe(10_000);
  });

  it("preserves an above-window request so routes can redirect to the final safe page", () => {
    expect(boundedPage("999999999999999999999999999999")).toBe(501);
    expect(boundedPage("502")).toBe(501);
    expect(collectionPageInput("502")).toEqual({ page: 501, wasAboveWindow: true });
    expect(collectionPageInput("501")).toEqual({ page: 501, wasAboveWindow: false });
    expect(collectionPageInput("1e999")).toEqual({ page: 1, wasAboveWindow: false });
  });
});
