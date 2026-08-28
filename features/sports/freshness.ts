export const FIXTURE_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type FixtureFreshness = Readonly<{
  status: "fresh" | "stale" | "unknown";
  lastSucceededAt: string | null;
  message: string;
}>;

function relativeUpdate(ageMs: number): string {
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function fixtureSyncAgeSeconds(
  lastSucceededAt: string | null,
  now = new Date(),
): number | null {
  if (lastSucceededAt === null) return null;
  const timestamp = Date.parse(lastSucceededAt);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));
}

export function deriveFixtureFreshness(
  lastSucceededAt: string | null,
  now = new Date(),
): FixtureFreshness {
  if (lastSucceededAt === null) {
    return {
      status: "unknown",
      lastSucceededAt: null,
      message: "Fixture freshness is not available yet.",
    };
  }

  const ageSeconds = fixtureSyncAgeSeconds(lastSucceededAt, now);
  if (ageSeconds === null) {
    return {
      status: "unknown",
      lastSucceededAt: null,
      message: "Fixture freshness is not available yet.",
    };
  }

  const ageMs = ageSeconds * 1000;
  const relative = relativeUpdate(ageMs);

  if (ageMs > FIXTURE_STALE_AFTER_MS) {
    return {
      status: "stale",
      lastSucceededAt,
      message: `Fixture data may be stale. Last successful update was ${relative}.`,
    };
  }

  return {
    status: "fresh",
    lastSucceededAt,
    message: `Fixture data was updated ${relative}.`,
  };
}
