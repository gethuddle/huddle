export type CalendarEvent = Readonly<{
  id: string;
  status: "draft" | "pending_group_review" | "published" | "cancelled" | "completed";
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  updatedAt: string;
  location: string | null;
  url: string;
}>;

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(/\r\n|\r|\n/g, "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

export function formatIcsUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid calendar timestamp.");
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const character of line) {
    const bytes = encoder.encode(character).byteLength;
    if (currentBytes + bytes > 75) {
      folded.push(current);
      current = ` ${character}`;
      currentBytes = 1 + bytes;
    } else {
      current += character;
      currentBytes += bytes;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

export function serializeCalendarEvent(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Get Huddle//Huddle MVP//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`${event.id}@gethuddle.app`)}`,
    `DTSTAMP:${formatIcsUtc(event.updatedAt)}`,
    `DTSTART:${formatIcsUtc(event.startsAt)}`,
    `DTEND:${formatIcsUtc(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    `DESCRIPTION:${escapeIcsText(event.status === "cancelled" ? "This event has been cancelled." : event.description)}`,
    `URL:${escapeIcsText(event.url)}`,
    ...(event.location === null ? [] : [`LOCATION:${escapeIcsText(event.location)}`]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
