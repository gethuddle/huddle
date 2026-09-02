import type { NextConfig } from "next";

import { resolveBuildApplicationUrl } from "./lib/env/build";
import { parseServerEnvironment } from "./lib/env/schema";
import { securityHeaders } from "./lib/security/headers";

// Fail the build before deployment when a hosted environment is mislabeled,
// uses insecure URLs, or is missing a server-only credential. The parser
// reports variable names only and never echoes secret values.
const buildEnvironment = parseServerEnvironment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: resolveBuildApplicationUrl(process.env),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  HUDDLE_ENVIRONMENT: process.env.HUDDLE_ENVIRONMENT,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FOOTBALL_DATA_API_TOKEN: process.env.FOOTBALL_DATA_API_TOKEN,
  SPORTS_SYNC_SECRET: process.env.SPORTS_SYNC_SECRET,
  DISCOVERY_CURSOR_SECRET: process.env.DISCOVERY_CURSOR_SECRET,
  AUTH_RECOVERY_TOKEN_SECRET: process.env.AUTH_RECOVERY_TOKEN_SECRET,
  AUTH_TURNSTILE_ENABLED: process.env.AUTH_TURNSTILE_ENABLED,
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET,
  TURNSTILE_HOSTNAMES: process.env.TURNSTILE_HOSTNAMES,
  ASSISTED_DISCOVERY_ENABLED: process.env.ASSISTED_DISCOVERY_ENABLED,
  ASSISTED_DISCOVERY_TOKEN_SECRET: process.env.ASSISTED_DISCOVERY_TOKEN_SECRET,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_WORKERS_AI_API_TOKEN: process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_APP_URL: buildEnvironment.NEXT_PUBLIC_APP_URL,
  },
  experimental: {
    // Next.js keeps its default same-origin Server Action check. Only the body
    // ceiling is customized; no proxy origin receives a bypass.
    serverActions: { bodySizeLimit: "256kb" },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "crests.football-data.org",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
};

export default nextConfig;
