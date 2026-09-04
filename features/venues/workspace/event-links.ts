export function safeVenueEventReturnTo(
  value: unknown,
  slug: string | null,
  canManage: boolean,
): string | null {
  if (!canManage || slug === null || typeof value !== "string") return null;
  const base = `/venues/${encodeURIComponent(slug)}/workspace`;
  return [base, `${base}/calendar`, `${base}/events`].includes(value) ? value : null;
}

export function venueEventHref(
  eventId: string,
  slug: string,
  surface: "today" | "calendar" | "events" = "today",
  manage = false,
) {
  const returnTo = `/venues/${encodeURIComponent(slug)}/workspace${surface === "today" ? "" : `/${surface}`}`;
  return `/events/${eventId}${manage ? "/manage" : ""}?${new URLSearchParams({ returnTo })}`;
}
