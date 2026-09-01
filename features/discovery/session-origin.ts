import { z } from "zod";

export const SESSION_ORIGIN_KEY = "huddle:discovery-origin";

const sessionOriginSchema = z
  .object({
    lat: z.number().finite().min(29).max(34),
    lng: z.number().finite().min(34).max(36),
    label: z.string().trim().min(1).max(300),
    kind: z.enum(["browser", "address"]),
  })
  .strict();

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SessionOrigin = z.infer<typeof sessionOriginSchema>;

export function parseSessionOrigin(origin: unknown): SessionOrigin | null {
  const result = sessionOriginSchema.safeParse(origin);
  return result.success ? result.data : null;
}

export function readSessionOrigin(storage: SessionStorage): SessionOrigin | null {
  try {
    const raw = storage.getItem(SESSION_ORIGIN_KEY);
    if (raw === null) return null;
    const result = parseSessionOrigin(JSON.parse(raw));
    if (result !== null) return result;
  } catch {
    // Invalid session state is cleared below and never used for a request.
  }
  storage.removeItem(SESSION_ORIGIN_KEY);
  return null;
}

export function writeSessionOrigin(storage: SessionStorage, origin: SessionOrigin): boolean {
  const parsed = parseSessionOrigin(origin);
  if (parsed === null) return false;
  try {
    storage.setItem(SESSION_ORIGIN_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function clearSessionOrigin(storage: SessionStorage): void {
  storage.removeItem(SESSION_ORIGIN_KEY);
}
