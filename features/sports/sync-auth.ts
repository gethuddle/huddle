import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Compare fixed-length digests so missing, short, and long candidates follow one path. */
export function sportsSyncSecretMatches(candidate: string | null, expected: string): boolean {
  return timingSafeEqual(digest(candidate ?? ""), digest(expected));
}
