import "server-only";

import { headers } from "next/headers";

import { requestIdFromHeaders } from "./index";

/** Read the validated request ID propagated by Proxy for a Server Component or Action. */
export async function getRequestId(): Promise<string> {
  return requestIdFromHeaders(await headers());
}
