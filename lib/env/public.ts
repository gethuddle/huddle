import { parsePublicEnvironment, type PublicEnvironment } from "./schema";

export function getPublicEnvironment(input?: unknown): PublicEnvironment {
  return parsePublicEnvironment(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
  );
}
