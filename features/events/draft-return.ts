import { eventRouteIdSchema } from "@/features/events/schemas";

export function safeEventDraftReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/events/new?")) return null;
  try {
    const url = new URL(value, "https://huddle.local");
    if (
      url.origin !== "https://huddle.local" ||
      url.pathname !== "/events/new" ||
      url.hash !== "" ||
      [...url.searchParams.keys()].some((key) => key !== "draft") ||
      url.searchParams.getAll("draft").length !== 1
    )
      return null;
    const draft = eventRouteIdSchema.safeParse(url.searchParams.get("draft"));
    return draft.success ? `/events/new?draft=${draft.data}` : null;
  } catch {
    return null;
  }
}
