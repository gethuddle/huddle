import type { NextRequest } from "next/server";
import { consumeAuthLink } from "@/features/auth/link-consumption-server";
export async function POST(request: NextRequest) {
  return consumeAuthLink(request, "email_change");
}
