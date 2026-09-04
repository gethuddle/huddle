// SDK RequestOptions.timeout uses seconds, unlike the local timers below.
export const POLAR_API_TIMEOUT_SECONDS = 5;
export const CHECKOUT_RECONCILIATION_TIMEOUT_MS = 15 * 60_000;
export const CHECKOUT_CONFIRMATION_POLL_INTERVAL_MS = 2_000;
// Presentation only: reaching this deadline cannot close a checkout attempt.
export const CHECKOUT_CONFIRMATION_POLL_TIMEOUT_MS = 60_000;
