import "server-only";

import { parseServerEnvironment, type ServerEnvironment } from "./schema";

export function getServerEnvironment(input?: unknown): ServerEnvironment {
  return parseServerEnvironment(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      HUDDLE_ENVIRONMENT: process.env.HUDDLE_ENVIRONMENT,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      FOOTBALL_DATA_API_TOKEN: process.env.FOOTBALL_DATA_API_TOKEN,
      SPORTS_SYNC_SECRET: process.env.SPORTS_SYNC_SECRET,
      DISCOVERY_CURSOR_SECRET: process.env.DISCOVERY_CURSOR_SECRET,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  );
}
