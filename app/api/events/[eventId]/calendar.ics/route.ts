import { type NextRequest } from "next/server";

import { getCalendarEvent } from "@/features/attendance/queries";
import { serializeCalendarEvent } from "@/features/calendar/ics";
import { eventRouteIdSchema } from "@/features/events/schemas";
import { toHttpError } from "@/lib/errors";
import { elapsedMilliseconds, safeLog } from "@/lib/observability/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const PRIVATE_CACHE = "private, no-cache, no-store, must-revalidate, max-age=0";
const PUBLIC_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

type Context = Readonly<{ params: Promise<Readonly<{ eventId: string }>> }>;

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();
  try {
    const eventId = eventRouteIdSchema.parse((await params).eventId);
    const event = await getCalendarEvent(eventId, requestId);
    const body = serializeCalendarEvent({
      id: event.event_id,
      title: event.title,
      description: event.description,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      updatedAt: event.updated_at,
      location: event.location_text,
      url: new URL(`/events/${event.event_id}`, request.nextUrl.origin).toString(),
    });
    safeLog("info", "route.completed", {
      requestId,
      route: "/api/events/[eventId]/calendar.ics",
      outcome: "succeeded",
      status: 200,
      durationMs: elapsedMilliseconds(startedAt),
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": event.public_cacheable ? PUBLIC_CACHE : PRIVATE_CACHE,
        "Content-Disposition": `attachment; filename="huddle-event-${event.event_id}.ics"`,
        "Content-Type": "text/calendar; charset=utf-8",
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  } catch (error) {
    const failure = toHttpError(error, requestId);
    safeLog("error", "route.failed", {
      requestId,
      route: "/api/events/[eventId]/calendar.ics",
      outcome: "failed",
      code: failure.body.error.code,
      status: failure.status,
      durationMs: elapsedMilliseconds(startedAt),
    });
    return Response.json(failure.body, {
      status: failure.status,
      headers: { "Cache-Control": PRIVATE_CACHE, [REQUEST_ID_HEADER]: requestId },
    });
  }
}
