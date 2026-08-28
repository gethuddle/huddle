const INTERNAL_PREFIXES = [
  "/auth/",
  "/discover",
  "/events",
  "/groups",
  "/matches",
  "/moderation",
  "/people/",
  "/reports",
  "/settings/",
  "/venues",
] as const;

export function safeInternalRedirect(value: unknown, fallback = "/") {
  if (typeof value !== "string" || value.length > 500) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/\p{Cc}/u.test(value)) return fallback;

  try {
    const parsed = new URL(value, "https://huddle.invalid");
    if (parsed.origin !== "https://huddle.invalid") return fallback;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (path === "/" || INTERNAL_PREFIXES.some((prefix) => path.startsWith(prefix))) return path;
  } catch {
    return fallback;
  }

  return fallback;
}
