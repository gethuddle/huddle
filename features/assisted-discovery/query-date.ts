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
const RELATIVE_DATE_PATTERN = `\\b(?:day\\s+after\\s+tomorrow|tonight|this\\s+evening|today|tomorrow|yesterday|(?:(?:next|this|last)\\s+)?(?:${WEEKDAY_PATTERN})|(?:next|this|last)\\s+(?:weekend|week|month|year)|in\\s+\\d{1,2}\\s+days?)\\b`;

type DateFailureReason = "invalid" | "past" | "too_wide";

export type QueryDateRangeResult =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "resolved"; fromDate: string; toDate: string }>
  | Readonly<{ kind: "invalid"; reason: DateFailureReason }>;

type CalendarParts = Readonly<{ year: number | null; month: number; day: number }>;
type CalendarExpression = Readonly<{ index: number; end: number; parts: CalendarParts }>;

function unsupportedDateModifier(query: string, index: number): boolean {
  return /\b(?:not|except|excluding|before|after|until|since)\s*$/u.test(query.slice(0, index));
}

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

function parsedNamedDates(query: string): CalendarExpression[] {
  const matches: CalendarExpression[] = [];
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
      end: match.index + match[0].length,
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
      end: match.index + match[0].length,
      parts: {
        day: Number(match[2]),
        month,
        year: match[3] === undefined ? null : Number(match[3]),
      },
    });
  }

  return matches
    .sort((left, right) => left.index - right.index)
    .filter((entry, index, entries) => index === 0 || entry.index !== entries[index - 1]?.index);
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

  // Resolve a whole bounded expression, never the first recognizable word in
  // unsupported compound language (for example "today or tomorrow").
  const relativeExpressions = [...normalized.matchAll(new RegExp(RELATIVE_DATE_PATTERN, "gu"))];
  const weekdayInterval = normalized.match(
    new RegExp(
      `\\b(?:from\\s+)?(?:(next|this)\\s+)?(${WEEKDAY_PATTERN})\\s*(?:to|through|[–—-])\\s*(?:(next|this)\\s+)?(${WEEKDAY_PATTERN})\\b`,
      "u",
    ),
  );
  const hasCalendarExpression =
    /\b\d{4}-\d{2}-\d{2}\b/u.test(normalized) ||
    parsedNamedDates(normalized).length > 0 ||
    new RegExp(`\\b(?:in|during|for)\\s+(?:${MONTH_PATTERN})\\b`, "u").test(normalized);
  if (relativeExpressions.length > 0 && hasCalendarExpression) {
    return { kind: "invalid", reason: "invalid" };
  }
  if (
    weekdayInterval !== null &&
    relativeExpressions.length === 2 &&
    !/\b(?:not|except|excluding|before|after|until|since)\b/u.test(normalized)
  ) {
    const start = weekdayRange(
      today,
      weekdayInterval[2] as keyof typeof WEEKDAYS,
      weekdayInterval[1] === "next",
    );
    const end = weekdayRange(
      today,
      weekdayInterval[4] as keyof typeof WEEKDAYS,
      weekdayInterval[3] === "next",
    );
    if (start.kind === "resolved" && end.kind === "resolved") {
      const endDate = end.fromDate < start.fromDate ? addDays(end.fromDate, 7) : end.fromDate;
      return { kind: "resolved", fromDate: start.fromDate, toDate: endDate };
    }
  }
  if (
    relativeExpressions.length > 1 ||
    relativeExpressions.some((expression) => unsupportedDateModifier(normalized, expression.index))
  ) {
    return { kind: "invalid", reason: "invalid" };
  }
  if (
    /\byesterday\b/u.test(normalized) ||
    /\blast\s+(?:day|week|weekend|month|year)\b/u.test(normalized) ||
    new RegExp(`\\blast\\s+(?:${WEEKDAY_PATTERN})\\b`, "u").test(normalized)
  ) {
    return { kind: "invalid", reason: "past" };
  }
  if (/\b(?:this\s+week|next\s+weekend|(?:this|next)\s+year)\b/u.test(normalized)) {
    return { kind: "invalid", reason: "invalid" };
  }
  if (/\b(?:tonight|this\s+evening)\b/u.test(normalized)) {
    return { kind: "resolved", fromDate: today, toDate: today };
  }
  if (/\bday\s+after\s+tomorrow\b/u.test(normalized)) {
    const target = addDays(today, 2);
    return { kind: "resolved", fromDate: target, toDate: target };
  }

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

  const isoDates: CalendarExpression[] = [
    ...normalized.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/gu),
  ].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
    parts: { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
  }));
  const dates = [...isoDates, ...parsedNamedDates(normalized)].sort(
    (left, right) => left.index - right.index,
  );
  if (dates.length > 0) {
    if (dates.length > 2 || dates.some((date) => unsupportedDateModifier(normalized, date.index))) {
      return { kind: "invalid", reason: "invalid" };
    }
    const first = resolveCalendarDate(dates[0]!.parts, today);
    if (dates.length === 1) return first;
    const separator = normalized.slice(dates[0]!.end, dates[1]!.index).trim();
    const isRange =
      /^(?:to|through|[–—-])$/u.test(separator) ||
      (separator === "and" && /\bbetween\s*$/u.test(normalized.slice(0, dates[0]!.index)));
    if (!isRange) return { kind: "invalid", reason: "invalid" };
    return combineDateRange(first, resolveCalendarDate(dates[1]!.parts, today));
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

  const monthMatches = [
    ...normalized.matchAll(new RegExp(`\\b(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`, "giu")),
  ];
  if (monthMatches.length > 1) return { kind: "invalid", reason: "invalid" };
  const monthMatch = monthMatches[0];
  if (monthMatch !== undefined) {
    if (unsupportedDateModifier(normalized, monthMatch.index)) {
      return { kind: "invalid", reason: "invalid" };
    }
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
    /\b(?:weekend|evening|week|fortnight)\b/u.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/u.test(normalized) ||
    /\b(?:in|within)\s+[a-z0-9-]+\s+(?:days?|weeks?|months?)\b/u.test(normalized)
  ) {
    return { kind: "invalid", reason: "invalid" };
  }

  return { kind: "absent" };
}
