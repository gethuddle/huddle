import { collectionPageInput } from "@/lib/pagination";
import { venueCalendarStatuses, type VenueCalendarStatus } from "./types";

export function venueCollectionState(raw: Record<string, string | string[] | undefined>) {
  const rawStatus = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const status = venueCalendarStatuses.includes(rawStatus as VenueCalendarStatus)
    ? (rawStatus as VenueCalendarStatus)
    : "all";
  const rawPage = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  return { status, ...collectionPageInput(rawPage) };
}

export function venueCollectionHref(
  slug: string,
  surface: "calendar" | "events",
  status: VenueCalendarStatus,
  page: number,
) {
  const base = `/venues/${encodeURIComponent(slug)}/workspace/${surface}`;
  return `${base}?${new URLSearchParams({ status, page: String(page) })}#venue-${surface}`;
}

export function safeVenueEventReturnTo(
  value: unknown,
  slug: string | null,
  canManage: boolean,
): string | null {
  if (!canManage || slug === null || typeof value !== "string") return null;
  const base = `/venues/${encodeURIComponent(slug)}/workspace`;
  if ([base, `${base}/calendar`, `${base}/events`].includes(value)) return value;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://huddle.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://huddle.invalid") return null;
  const surface =
    parsed.pathname === `${base}/calendar`
      ? "calendar"
      : parsed.pathname === `${base}/events`
        ? "events"
        : null;
  if (surface === null || parsed.hash !== `#venue-${surface}`) return null;
  if ([...parsed.searchParams.keys()].some((key) => key !== "status" && key !== "page"))
    return null;
  if (
    parsed.searchParams.getAll("status").length !== 1 ||
    parsed.searchParams.getAll("page").length !== 1
  )
    return null;
  const status = parsed.searchParams.get("status");
  if (!venueCalendarStatuses.includes(status as VenueCalendarStatus)) return null;
  const rawPage = parsed.searchParams.get("page");
  if (rawPage === null || !/^\d+$/.test(rawPage)) return null;
  const pageInput = collectionPageInput(rawPage);
  if (pageInput.wasAboveWindow || String(pageInput.page) !== rawPage) return null;
  return venueCollectionHref(slug, surface, status as VenueCalendarStatus, pageInput.page);
}

export function venueEventHref(
  eventId: string,
  slug: string,
  surface: "today" | "calendar" | "events" = "today",
  manage = false,
  returnTo?: string,
) {
  const destination =
    returnTo ??
    `/venues/${encodeURIComponent(slug)}/workspace${surface === "today" ? "" : `/${surface}`}`;
  return `/events/${eventId}${manage ? "/manage" : ""}?${new URLSearchParams({ returnTo: destination })}`;
}
