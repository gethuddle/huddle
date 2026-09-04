import {
  PolarWebhookInputError,
  processPolarBillingEvent,
  validateAndNormalizePolarWebhook,
} from "@/features/venue-billing/webhook";
import { DomainError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let eventType: string | undefined;
  try {
    const event = await validateAndNormalizePolarWebhook(await request.text(), request.headers);
    eventType = event.type;
    await processPolarBillingEvent(event);
    return Response.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const outcome =
      error instanceof PolarWebhookInputError
        ? error.code
        : error instanceof DomainError &&
            ["INVALID_TRANSITION", "VALIDATION_FAILED"].includes(error.code)
          ? "payload"
          : "retry";
    const status =
      outcome === "signature"
        ? 403
        : outcome === "payload"
          ? 400
          : outcome === "unsupported"
            ? 202
            : 503;
    console.info("polar.webhook", { requestId, eventType, outcome });
    return Response.json(status === 202 ? { received: true } : { received: false }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
