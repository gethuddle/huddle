import "server-only";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { getServerEnvironment } from "@/lib/env/server";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

export const turnstileActionSchema = z.enum(["signup", "login", "password_reset"]);
export type TurnstileAction = z.infer<typeof turnstileActionSchema>;

const turnstileResponseSchema = z
  .object({
    success: z.boolean(),
    action: z.string().min(1),
    hostname: z.string().min(1),
  })
  .passthrough();

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

type VerifyTurnstileInput = Readonly<{
  token: string;
  expectedAction: TurnstileAction;
  secret: string;
  expectedHostnames: string;
  remoteIp?: string;
}>;

export function getAuthTurnstileSiteKey(): string | undefined {
  const environment = getServerEnvironment();
  return environment.AUTH_TURNSTILE_ENABLED
    ? environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    : undefined;
}

function verificationFailed(cause?: unknown): DomainError {
  return new DomainError("VALIDATION_FAILED", {
    cause,
    fields: { _form: ["Please complete the security check and try again."] },
  });
}

export async function verifyTurnstileToken(
  input: VerifyTurnstileInput,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = input.token.trim();
  const hostnames = new Set(
    input.expectedHostnames
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
  if (
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    input.secret.trim().length === 0 ||
    hostnames.size === 0
  ) {
    throw verificationFailed();
  }

  const body = new URLSearchParams({
    secret: input.secret,
    response: token,
    ...(input.remoteIp === undefined ? {} : { remoteip: input.remoteIp }),
  });

  try {
    const response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(8_000),
      body,
    });
    if (!response.ok) throw verificationFailed();
    const result = turnstileResponseSchema.parse(await response.json());
    if (
      !result.success ||
      result.action !== input.expectedAction ||
      !hostnames.has(result.hostname.toLowerCase())
    ) {
      throw verificationFailed();
    }
  } catch (cause) {
    if (cause instanceof DomainError) throw cause;
    throw verificationFailed(cause);
  }
}
