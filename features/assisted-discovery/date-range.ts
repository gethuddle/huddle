import type { IntentDraft } from "./schemas";

import { formatIsraelDateValue } from "@/features/sports/time";

type DateInput = Pick<
  IntentDraft,
  "temporal" | "weekday" | "explicitStartDate" | "explicitEndDate"
>;

export type IntentDateRangeResult =
  | Readonly<{ ok: true; fromDate: string; toDate: string }>
  | Readonly<{ ok: false; reason: "invalid" | "past" | "too_wide" }>;

const DAY_MS = 86_400_000;
const WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

function dateEpoch(dateValue: string): number {
  const [year, month, day] = dateValue.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDays(dateValue: string, days: number): string {
  const next = new Date(dateEpoch(dateValue) + days * DAY_MS);
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function resolveIntentDateRange(input: DateInput, now: Date): IntentDateRangeResult {
  const today = formatIsraelDateValue(now);

  if (input.temporal === "explicit_range") {
    if (input.explicitStartDate === null || input.explicitEndDate === null) {
      return { ok: false, reason: "invalid" };
    }
    if (input.explicitStartDate < today) return { ok: false, reason: "past" };
    const span = (dateEpoch(input.explicitEndDate) - dateEpoch(input.explicitStartDate)) / DAY_MS;
    if (span < 0) return { ok: false, reason: "invalid" };
    if (span > 30) return { ok: false, reason: "too_wide" };
    return {
      ok: true,
      fromDate: input.explicitStartDate,
      toDate: input.explicitEndDate,
    };
  }

  if (input.temporal === "today") return { ok: true, fromDate: today, toDate: today };
  if (input.temporal === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return { ok: true, fromDate: tomorrow, toDate: tomorrow };
  }
  if (input.temporal === "unspecified") {
    return { ok: true, fromDate: today, toDate: addDays(today, 14) };
  }

  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  if (input.temporal === "next_weekday") {
    if (input.weekday === null) return { ok: false, reason: "invalid" };
    const targetWeekday = WEEKDAY_INDEX[input.weekday];
    const daysUntilTarget = (targetWeekday - weekday + 7) % 7 || 7;
    const targetDate = addDays(today, daysUntilTarget);
    return { ok: true, fromDate: targetDate, toDate: targetDate };
  }
  if (input.temporal === "this_weekend") {
    if (weekday === 0) return { ok: true, fromDate: today, toDate: today };
    if (weekday === 5) return { ok: true, fromDate: today, toDate: addDays(today, 2) };
    if (weekday === 6) return { ok: true, fromDate: today, toDate: addDays(today, 1) };
    const friday = addDays(today, 5 - weekday);
    return { ok: true, fromDate: friday, toDate: addDays(friday, 2) };
  }

  const nextSunday = addDays(today, weekday === 0 ? 7 : 7 - weekday);
  return { ok: true, fromDate: nextSunday, toDate: addDays(nextSunday, 6) };
}
