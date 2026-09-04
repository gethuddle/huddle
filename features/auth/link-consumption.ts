import {
  recoveryQuerySchema,
  emailChangeQuerySchema,
  verificationCodeQuerySchema,
  verificationQuerySchema,
} from "./schemas";

export type AuthLinkPurpose = "email" | "recovery" | "email_change";

export type AuthLinkCredential =
  | Readonly<{ kind: "code"; code: string }>
  | Readonly<{ kind: "token_hash"; tokenHash: string; type: AuthLinkPurpose }>;

export const authNoStoreHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

function parseEntries(
  entries: ReadonlyArray<readonly [string, string]>,
  purpose: AuthLinkPurpose,
): AuthLinkCredential | null {
  const keys = entries.map(([key]) => key);
  const values = new Map(entries);

  if (keys.length === 1 && keys[0] === "code") {
    if (purpose === "email_change") return null;
    const parsed = verificationCodeQuerySchema.safeParse({ code: values.get("code") });
    return parsed.success ? { kind: "code", code: parsed.data.code } : null;
  }

  if (
    keys.length === 2 &&
    keys.includes("token_hash") &&
    keys.includes("type") &&
    new Set(keys).size === 2
  ) {
    const input = {
      tokenHash: values.get("token_hash"),
      type: values.get("type"),
    };
    const parsed =
      purpose === "email_change"
        ? emailChangeQuerySchema.safeParse(input)
        : purpose === "email"
          ? verificationQuerySchema.safeParse(input)
          : recoveryQuerySchema.safeParse(input);
    return parsed.success
      ? { kind: "token_hash", tokenHash: parsed.data.tokenHash, type: parsed.data.type }
      : null;
  }

  return null;
}

export function parseAuthLinkCredential(
  fragment: string,
  purpose: AuthLinkPurpose,
): AuthLinkCredential | null {
  const normalized = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return parseEntries([...new URLSearchParams(normalized).entries()], purpose);
}

export function parseAuthLinkForm(
  formData: FormData,
  purpose: AuthLinkPurpose,
): AuthLinkCredential | null {
  const entries: Array<readonly [string, string]> = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") return null;
    entries.push([key, value]);
  }
  return parseEntries(entries, purpose);
}

export function requestHasExpectedOrigin(origin: string | null, appUrl: string): boolean {
  if (origin === null) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
