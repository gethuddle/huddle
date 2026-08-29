import type { NextConfig } from "next";

import { parseServerEnvironment } from "./lib/env/schema";
import { securityHeaders } from "./lib/security/headers";

// Fail the build before deployment when a hosted environment is mislabeled,
// uses insecure URLs, or is missing a server-only credential. The parser
// reports variable names only and never echoes secret values.
parseServerEnvironment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  HUDDLE_ENVIRONMENT: process.env.HUDDLE_ENVIRONMENT,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FOOTBALL_DATA_API_TOKEN: process.env.FOOTBALL_DATA_API_TOKEN,
  SPORTS_SYNC_SECRET: process.env.SPORTS_SYNC_SECRET,
  DISCOVERY_CURSOR_SECRET: process.env.DISCOVERY_CURSOR_SECRET,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Next.js keeps its default same-origin Server Action check. Only the body
    // ceiling is customized; no proxy origin receives a bypass.
    serverActions: { bodySizeLimit: "256kb" },
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
