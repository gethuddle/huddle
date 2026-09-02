import { passiveLegacyAuthRedirect } from "@/features/auth/link-consumption-server";
import { getPublicEnvironment } from "@/lib/env/public";

export async function GET() {
  return passiveLegacyAuthRedirect(getPublicEnvironment().NEXT_PUBLIC_APP_URL, "email");
}
