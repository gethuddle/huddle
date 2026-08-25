export const PROVIDER_ERROR_CATEGORIES = [
  "AUTH",
  "RATE_LIMIT",
  "UPSTREAM_4XX",
  "UPSTREAM_5XX",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "UNKNOWN",
] as const;

export type ProviderErrorCategory = (typeof PROVIDER_ERROR_CATEGORIES)[number];

const SAFE_PROVIDER_ERROR_SUMMARIES = {
  AUTH: "Provider authentication was rejected.",
  RATE_LIMIT: "Provider rate limit was reached.",
  UPSTREAM_4XX: "Provider rejected the bounded request.",
  UPSTREAM_5XX: "Provider is temporarily unavailable.",
  TIMEOUT: "Provider request timed out.",
  INVALID_RESPONSE: "Provider response did not match the expected schema.",
  UNKNOWN: "Provider request failed unexpectedly.",
} satisfies Record<ProviderErrorCategory, string>;

export class ProviderAdapterError extends Error {
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    category: ProviderErrorCategory,
    options: Readonly<{ cause?: unknown; retryable?: boolean; status?: number }> = {},
  ) {
    super(SAFE_PROVIDER_ERROR_SUMMARIES[category], { cause: options.cause });
    this.name = "ProviderAdapterError";
    this.category = category;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

export function toProviderAdapterError(error: unknown): ProviderAdapterError {
  return error instanceof ProviderAdapterError
    ? error
    : new ProviderAdapterError("UNKNOWN", { cause: error });
}
