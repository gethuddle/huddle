export const DOMAIN_ERROR_CODES = [
  "AUTH_REQUIRED",
  "AUTH_FAILED",
  "EMAIL_NOT_VERIFIED",
  "ADULT_ATTESTATION_REQUIRED",
  "RULES_ACCEPTANCE_REQUIRED",
  "PROFILE_INCOMPLETE",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_RESTRICTED",
  "NOT_FOUND",
  "NOT_ALLOWED",
  "VALIDATION_FAILED",
  "HANDLE_UNAVAILABLE",
  "BLOCKED_RELATIONSHIP",
  "FRIENDSHIP_EXISTS",
  "RATE_LIMITED",
  "INVALID_TRANSITION",
  "GROUP_SLUG_UNAVAILABLE",
  "GROUP_OWNER_REQUIRED",
  "GROUP_BANNED",
  "VENUE_SLUG_UNAVAILABLE",
  "INVITE_INVALID",
  "INVITE_EXPIRED",
  "EVENT_CANCELLED",
  "EVENT_STARTED",
  "EVENT_FULL",
  "ALREADY_ATTENDING",
  "MATERIAL_CHANGE_REQUIRES_NEW_EVENT",
  "LOCATION_NOT_AUTHORIZED",
  "SYNC_ALREADY_RUNNING",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export const DOMAIN_ERROR_MESSAGES = {
  AUTH_REQUIRED: "Sign in to continue.",
  AUTH_FAILED: "The email or password is incorrect.",
  EMAIL_NOT_VERIFIED: "Verify your email to continue.",
  ADULT_ATTESTATION_REQUIRED: "Confirm that you are 18 or older to continue.",
  RULES_ACCEPTANCE_REQUIRED: "Accept the current community rules to continue.",
  PROFILE_INCOMPLETE: "Complete your profile to continue.",
  ACCOUNT_SUSPENDED: "This account cannot perform that action.",
  ACCOUNT_RESTRICTED: "This account is temporarily limited to safety and appeal actions.",
  NOT_FOUND: "We could not find that item.",
  NOT_ALLOWED: "You cannot perform that action.",
  VALIDATION_FAILED: "Check the highlighted fields and try again.",
  HANDLE_UNAVAILABLE: "Choose another handle.",
  BLOCKED_RELATIONSHIP: "That interaction is not available.",
  FRIENDSHIP_EXISTS: "That friendship request already exists.",
  RATE_LIMITED: "Please wait a moment before sending another request.",
  INVALID_TRANSITION: "That change is no longer available.",
  GROUP_SLUG_UNAVAILABLE: "Choose another group URL.",
  GROUP_OWNER_REQUIRED: "Every group must retain its active owner.",
  GROUP_BANNED: "That group action is not available.",
  VENUE_SLUG_UNAVAILABLE: "Choose another venue URL.",
  INVITE_INVALID: "That invitation is not available.",
  INVITE_EXPIRED: "That invitation is no longer available.",
  EVENT_CANCELLED: "This event has been cancelled.",
  EVENT_STARTED: "This event has already started.",
  EVENT_FULL: "This event is full.",
  ALREADY_ATTENDING: "You already have an attendance response for this event.",
  MATERIAL_CHANGE_REQUIRES_NEW_EVENT: "Cancel this event and create a new one for that change.",
  LOCATION_NOT_AUTHORIZED: "The event location is not available.",
  SYNC_ALREADY_RUNNING: "A sports-data synchronization is already running.",
  UPSTREAM_UNAVAILABLE: "That service is temporarily unavailable. Try again later.",
  INTERNAL_ERROR: "Something went wrong. Try again.",
} satisfies Record<DomainErrorCode, string>;

export type FieldErrors = Record<string, string[]>;

type DomainErrorOptions = Readonly<{
  cause?: unknown;
  fields?: FieldErrors;
}>;

/** Expected application failure with a centrally controlled public message. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fields?: FieldErrors;

  constructor(code: DomainErrorCode, options: DomainErrorOptions = {}) {
    super(DOMAIN_ERROR_MESSAGES[code], { cause: options.cause });
    this.name = "DomainError";
    this.code = code;
    this.fields = options.fields;
  }
}
