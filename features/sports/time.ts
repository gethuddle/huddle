const JERUSALEM_TIME_ZONE = "Asia/Jerusalem";

type DateParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;

function partsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function localMidnightToUtc(dateValue: string, timeZone: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const desiredLocalTimestamp = Date.UTC(year, month - 1, day);
  let candidate = desiredLocalTimestamp;

  // Two passes account for the zone offset without introducing a date library.
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = partsInTimeZone(new Date(candidate), timeZone);
    const actualLocalTimestamp = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate += desiredLocalTimestamp - actualLocalTimestamp;
  }

  return new Date(candidate);
}

function nextDateValue(dateValue: string): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function jerusalemDayUtcBounds(dateValue: string): Readonly<{
  start: string;
  end: string;
}> {
  return {
    start: localMidnightToUtc(dateValue, JERUSALEM_TIME_ZONE).toISOString(),
    end: localMidnightToUtc(nextDateValue(dateValue), JERUSALEM_TIME_ZONE).toISOString(),
  };
}

export function formatJerusalemKickoff(value: string): string {
  return new Intl.DateTimeFormat("en-IL", {
    timeZone: JERUSALEM_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatJerusalemDateValue(date = new Date()): string {
  const parts = partsInTimeZone(date, JERUSALEM_TIME_ZONE);
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}
