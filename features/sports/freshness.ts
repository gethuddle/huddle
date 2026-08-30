import { formatIsraelDateValue } from "./time";

export const FIXTURE_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type FixtureFreshness = Readonly<{
  status: "fresh" | "stale" | "unknown";
  coverageStatus: "available" | "short" | "unknown";
  updatedAt: string | null;
  coverageThrough: string | null;
  updatedLabel: string;
  coverageLabel: string;
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

function validTimestamp(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(value));
}

function formatCoverageDate(value: string): string {
  return new Intl.DateTimeFormat("en-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function seasonEndMonth(now: Date): Readonly<{ month: number; year: number }> {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() <= 4 ? { month: 5, year } : { month: 5, year: year + 1 };
}

function coverageReachesSeasonEndMonth(value: string, now: Date): boolean {
  const [year, month] = formatIsraelDateValue(new Date(value)).split("-").map(Number);
  const target = seasonEndMonth(now);
  return year > target.year || (year === target.year && month >= target.month);
}

export function fixtureSyncAgeSeconds(updatedAt: string | null, now = new Date()): number | null {
  if (!validTimestamp(updatedAt)) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(updatedAt)) / 1000));
}

export function fixtureCoverageIncludesDate(
  coverageThrough: string | null,
  israelDate: string,
): boolean | null {
  if (!validTimestamp(coverageThrough) || !/^\d{4}-\d{2}-\d{2}$/.test(israelDate)) return null;
  return israelDate <= formatIsraelDateValue(new Date(coverageThrough));
}

export function deriveFixtureFreshness(
  updatedAt: string | null,
  coverageThrough: string | null,
  now = new Date(),
): FixtureFreshness {
  const ageSeconds = fixtureSyncAgeSeconds(updatedAt, now);
  const validUpdatedAt = ageSeconds === null ? null : updatedAt;
  const validCoverageThrough = validTimestamp(coverageThrough) ? coverageThrough : null;

  return {
    status:
      ageSeconds === null
        ? "unknown"
        : ageSeconds * 1000 > FIXTURE_STALE_AFTER_MS
          ? "stale"
          : "fresh",
    coverageStatus:
      validCoverageThrough === null
        ? "unknown"
        : coverageReachesSeasonEndMonth(validCoverageThrough, now)
          ? "available"
          : "short",
    updatedAt: validUpdatedAt,
    coverageThrough: validCoverageThrough,
    updatedLabel: ageSeconds === null ? "Not available yet" : relativeUpdate(ageSeconds * 1000),
    coverageLabel:
      validCoverageThrough === null
        ? "Not available yet"
        : formatCoverageDate(validCoverageThrough),
  };
}
