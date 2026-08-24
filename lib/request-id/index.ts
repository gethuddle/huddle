import { z } from "zod";

export const REQUEST_ID_HEADER = "x-request-id";

const requestIdSchema = z.uuid();

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function resolveRequestId(
  candidate: string | null | undefined,
  generate: () => string = createRequestId,
): string {
  const result = requestIdSchema.safeParse(candidate);
  return result.success ? result.data.toLowerCase() : generate();
}

export function requestIdFromHeaders(
  headers: Pick<Headers, "get">,
  generate?: () => string,
): string {
  return resolveRequestId(headers.get(REQUEST_ID_HEADER), generate);
}
