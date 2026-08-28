import "server-only";

type SafeLogValue = string | number | boolean | null;

export type SafeLogContext = Readonly<{
  requestId?: string;
  route?: string;
  action?: string;
  outcome?: "succeeded" | "denied" | "failed";
  code?: string;
  status?: number;
  durationMs?: number;
  itemCount?: number;
  syncAgeSeconds?: number;
  syncRequestCount?: number;
  quotaRemaining?: number;
  retryCount?: number;
  runId?: string;
}>;

const allowedKeys = new Set<keyof SafeLogContext>([
  "requestId",
  "route",
  "action",
  "outcome",
  "code",
  "status",
  "durationMs",
  "itemCount",
  "syncAgeSeconds",
  "syncRequestCount",
  "quotaRemaining",
  "retryCount",
  "runId",
]);

export function safeLog(level: "info" | "warn" | "error", event: string, context: SafeLogContext) {
  const safeContext: Record<string, SafeLogValue> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!allowedKeys.has(key as keyof SafeLogContext) || value === undefined) continue;
    safeContext[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  console[level](event.replaceAll(/[^a-z0-9_.]/g, "_").slice(0, 80), safeContext);
}

export function elapsedMilliseconds(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
