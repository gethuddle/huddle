import { formatIsraelDateValue } from "@/features/sports/time";

const DAY_MS = 86_400_000;
const MONTHS = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
} as const;
const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;
const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((left, right) => right.length - left.length)
  .join("|");
const WEEKDAY_PATTERN = Object.keys(WEEKDAYS).join("|");

type DateFailureReason = "invalid" | "past" | "too_wide";

export type QueryDateRangeResult =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "resolved"; fromDate: string; toDate: string }>
  | Readonly<{ kind: "invalid"; reason: DateFailureReason }>;

type CalendarParts = Readonly<{ year: number | null; month: number; day: number }>;

function dateEpoch(dateValue: string): number {
  const [year, month, day] = dateValue.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(dateEpoch(dateValue) + days * DAY_MS);
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function resolveCalendarDate(parts: CalendarParts, today: string): QueryDateRangeResult {
  const [todayYear, todayMonth] = today.split("-").map(Number);
  let year = parts.year ?? todayYear;
  if (!validCalendarDate(year, parts.month, parts.day)) {
    return { kind: "invalid", reason: "invalid" };
  }

  let date = formatDate(year, parts.month, parts.day);
  if (parts.year === null && date < today) {
    year += 1;
    if (!validCalendarDate(year, parts.month, parts.day)) {
      return { kind: "invalid", reason: "invalid" };
    }
    date = formatDate(year, parts.month, parts.day);
  }
  if (parts.year !== null && date < today) return { kind: "invalid", reason: "past" };
  if (parts.year === null && parts.month === todayMonth && date < today) {
    return { kind: "invalid", reason: "past" };
  }
  return { kind: "resolved", fromDate: date, toDate: date };
}

function resolveMonth(
  month: number,
  requestedYear: number | null,
  today: string,
): QueryDateRangeResult {
  const [todayYear, todayMonth] = today.split("-").map(Number);
  let year = requestedYear ?? todayYear;
  if (requestedYear === null && month < todayMonth) year += 1;

  const monthEnd = formatDate(year, month, daysInMonth(year, month));
  if (monthEnd < today) return { kind: "invalid", reason: "past" };
  const monthStart = formatDate(year, month, 1);
  return {
    kind: "resolved",
    fromDate: monthStart < today ? today : monthStart,
    toDate: monthEnd,
  };
}

function weekdayRange(
  today: string,
  weekdayName: keyof typeof WEEKDAYS,
  strictlyFuture: boolean,
): QueryDateRangeResult {
  const currentWeekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const targetWeekday = WEEKDAYS[weekdayName];
  const ordinaryDelta = (targetWeekday - currentWeekday + 7) % 7;
  const delta = strictlyFuture && ordinaryDelta === 0 ? 7 : ordinaryDelta;
  const target = addDays(today, delta);
  return { kind: "resolved", fromDate: target, toDate: target };
}

function weekendRange(today: string): QueryDateRangeResult {
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  if (weekday === 0) return { kind: "resolved", fromDate: today, toDate: today };
  if (weekday === 5) return { kind: "resolved", fromDate: today, toDate: addDays(today, 2) };
  if (weekday === 6) return { kind: "resolved", fromDate: today, toDate: addDays(today, 1) };
  const friday = addDays(today, 5 - weekday);
  return { kind: "resolved", fromDate: friday, toDate: addDays(friday, 2) };
}

function nextWeekRange(today: string): QueryDateRangeResult {
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const sunday = addDays(today, weekday === 0 ? 7 : 7 - weekday);
  return { kind: "resolved", fromDate: sunday, toDate: addDays(sunday, 6) };
}

function parsedNamedDates(query: string): CalendarParts[] {
  const matches: Array<Readonly<{ index: number; parts: CalendarParts }>> = [];
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:,?\\s+(\\d{4}))?\\b`,
    "giu",
  );
  const monthFirst = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
    "giu",
  );

  for (const match of query.matchAll(dayFirst)) {
    const monthName = match[2]?.toLocaleLowerCase("en");
    const month = monthName === undefined ? undefined : MONTHS[monthName as keyof typeof MONTHS];
    if (month === undefined) continue;
    matches.push({
      index: match.index,
      parts: {
        day: Number(match[1]),
        month,
        year: match[3] === undefined ? null : Number(match[3]),
      },
    });
  }
  for (const match of query.matchAll(monthFirst)) {
    const monthName = match[1]?.toLocaleLowerCase("en");
    const month = monthName === undefined ? undefined : MONTHS[monthName as keyof typeof MONTHS];
    if (month === undefined) continue;
    matches.push({
      index: match.index,
      parts: {
        day: Number(match[2]),
        month,
        year: match[3] === undefined ? null : Number(match[3]),
      },
    });
  }

  return matches
    .sort((left, right) => left.index - right.index)
    .filter((entry, index, entries) => index === 0 || entry.index !== entries[index - 1]?.index)
    .map((entry) => entry.parts);
}

function combineDateRange(
  start: QueryDateRangeResult,
  end: QueryDateRangeResult,
): QueryDateRangeResult {
  if (start.kind !== "resolved") return start;
  if (end.kind !== "resolved") return end;
  if (end.fromDate < start.fromDate) return { kind: "invalid", reason: "invalid" };
  const span = (dateEpoch(end.fromDate) - dateEpoch(start.fromDate)) / DAY_MS;
  if (span > 30) return { kind: "invalid", reason: "too_wide" };
  return { kind: "resolved", fromDate: start.fromDate, toDate: end.fromDate };
}

export function resolveQueryDateRange(query: string, now: Date): QueryDateRangeResult {
  const normalized = query
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/\b(?:tommorow|tomorow)\b/gu, "tomorrow");
  const today = formatIsraelDateValue(now);

  if (/\btoday\b/u.test(normalized)) {
    return { kind: "resolved", fromDate: today, toDate: today };
  }
  if (/\btomorrow\b/u.test(normalized)) {
    const tomorrow = addDays(today, 1);
    return { kind: "resolved", fromDate: tomorrow, toDate: tomorrow };
  }
  if (/\bthis\s+weekend\b/u.test(normalized)) return weekendRange(today);
  if (/\bnext\s+week\b/u.test(normalized)) return nextWeekRange(today);

  const weekday = normalized.match(
    new RegExp(`\\b(?:(next|this)\\s+)?(${WEEKDAY_PATTERN})\\b`, "iu"),
  );
  if (weekday !== null) {
    return weekdayRange(
      today,
      weekday[2]!.toLocaleLowerCase("en") as keyof typeof WEEKDAYS,
      weekday[1]?.toLocaleLowerCase("en") === "next",
    );
  }

  const isoDates = [...normalized.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/gu)].map((match) => ({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }));
  if (isoDates.length > 0) {
    const first = resolveCalendarDate(isoDates[0]!, today);
    return isoDates.length === 1
      ? first
      : combineDateRange(first, resolveCalendarDate(isoDates[1]!, today));
  }

  const namedDates = parsedNamedDates(normalized);
  if (namedDates.length > 0) {
    const first = resolveCalendarDate(namedDates[0]!, today);
    return namedDates.length === 1
      ? first
      : combineDateRange(first, resolveCalendarDate(namedDates[1]!, today));
  }

  const relativeDays = normalized.match(/\bin\s+(\d{1,2})\s+days?\b/u);
  if (relativeDays !== null) {
    const target = addDays(today, Number(relativeDays[1]));
    return { kind: "resolved", fromDate: target, toDate: target };
  }

  if (/\bnext\s+month\b/u.test(normalized)) {
    const [year, month] = today.split("-").map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    return resolveMonth(nextMonth, nextMonthYear, today);
  }
  if (/\bthis\s+month\b/u.test(normalized)) {
    const [, month] = today.split("-").map(Number);
    return resolveMonth(month, Number(today.slice(0, 4)), today);
  }

  const monthMatch = normalized.match(
    new RegExp(`\\b(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`, "iu"),
  );
  if (monthMatch !== null) {
    const name = monthMatch[1]!.toLocaleLowerCase("en") as keyof typeof MONTHS;
    if (
      name === "may" &&
      monthMatch[2] === undefined &&
      !/\b(?:in|during|for|this|next|show)\s+may\b/u.test(normalized)
    ) {
      return { kind: "absent" };
    }
    return resolveMonth(
      MONTHS[name],
      monthMatch[2] === undefined ? null : Number(monthMatch[2]),
      today,
    );
  }

  if (
    /\b20\d{2}\b/u.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/u.test(normalized) ||
    /\b(?:in|within)\s+[a-z0-9-]+\s+(?:days?|weeks?|months?)\b/u.test(normalized)
  ) {
    return { kind: "invalid", reason: "invalid" };
  }

  return { kind: "absent" };
}
