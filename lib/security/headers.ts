const baseDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://tile.openstreetmap.org",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
] as const;

export function contentSecurityPolicy(production: boolean) {
  const scripts = production
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const connections = production
    ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://tile.openstreetmap.org"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://tile.openstreetmap.org ws://127.0.0.1:* ws://localhost:*";
  return [
    ...baseDirectives,
    scripts,
    connections,
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function securityHeaders(production: boolean) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(production) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(production
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : []),
  ];
}
