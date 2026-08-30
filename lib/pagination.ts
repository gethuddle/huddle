import { z } from "zod";

export const COLLECTION_PAGE_SIZE = 20;
export const MAX_RPC_OFFSET = 10_000;
export const MAX_COLLECTION_PAGE = Math.floor(MAX_RPC_OFFSET / COLLECTION_PAGE_SIZE) + 1;
export const MAX_COLLECTION_ITEMS = MAX_RPC_OFFSET + COLLECTION_PAGE_SIZE;

export type CollectionPageInput = Readonly<{
  page: number;
  wasAboveWindow: boolean;
}>;

export function collectionPageInput(value: unknown): CollectionPageInput {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      return { page: 1, wasAboveWindow: false };
    }
    return value > MAX_COLLECTION_PAGE
      ? { page: MAX_COLLECTION_PAGE, wasAboveWindow: true }
      : { page: value, wasAboveWindow: false };
  }

  if (typeof value === "bigint") {
    if (value < BigInt(1)) return { page: 1, wasAboveWindow: false };
    return value > BigInt(MAX_COLLECTION_PAGE)
      ? { page: MAX_COLLECTION_PAGE, wasAboveWindow: true }
      : { page: Number(value), wasAboveWindow: false };
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      const numeric = BigInt(normalized);
      if (numeric < BigInt(1)) return { page: 1, wasAboveWindow: false };
      return numeric > BigInt(MAX_COLLECTION_PAGE)
        ? { page: MAX_COLLECTION_PAGE, wasAboveWindow: true }
        : { page: Number(numeric), wasAboveWindow: false };
    }
  }

  return { page: 1, wasAboveWindow: false };
}

export const boundedPageSchema = z.unknown().transform((value) => collectionPageInput(value).page);

export function boundedPage(value: unknown): number {
  return collectionPageInput(value).page;
}

export function collectionOffset(page: unknown): number {
  return (boundedPage(page) - 1) * COLLECTION_PAGE_SIZE;
}

export function collectionPageCount(totalCount: number): number {
  return Math.max(1, Math.ceil(collectionVisibleTotal(totalCount) / COLLECTION_PAGE_SIZE));
}

export function collectionVisibleTotal(totalCount: number): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 0;
  return Math.min(Math.trunc(totalCount), MAX_COLLECTION_ITEMS);
}

export function collectionHasOverflow(totalCount: number): boolean {
  return Number.isFinite(totalCount) && totalCount > MAX_COLLECTION_ITEMS;
}
