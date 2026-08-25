const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const syncSecret = process.env.SPORTS_SYNC_SECRET;

if (!appUrl || !syncSecret) {
  console.error(
    "Set NEXT_PUBLIC_APP_URL and SPORTS_SYNC_SECRET in .env.local before running the explicit sync.",
  );
  process.exit(1);
}

let response;
try {
  response = await fetch(new URL("/api/internal/sports-sync", appUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-huddle-sync-secret": syncSecret,
    },
    body: JSON.stringify({ reason: "manual" }),
  });
} catch {
  console.error("Could not reach the running Huddle server.");
  process.exit(1);
}

let result;
try {
  result = await response.json();
} catch {
  console.error(`Sports sync returned an unreadable response (${response.status}).`);
  process.exit(1);
}

if (!response.ok) {
  const code = result?.error?.code ?? "UNKNOWN";
  const requestId = result?.requestId ?? response.headers.get("x-request-id") ?? "unavailable";
  console.error(`Sports sync failed safely: ${code} (request ${requestId}).`);
  process.exit(1);
}

console.log(`Sports sync ${result.runId} completed.`);
console.log(JSON.stringify(result.summary, null, 2));
