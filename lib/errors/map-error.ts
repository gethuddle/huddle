import { z } from "zod";

import { resolveRequestId } from "@/lib/request-id";

import {
  DOMAIN_ERROR_MESSAGES,
  DomainError,
  type DomainErrorCode,
  type FieldErrors,
} from "./domain";
import type { ActionError, ActionResult } from "./result";

const HTTP_STATUS_BY_CODE = {
  AUTH_REQUIRED: 401,
  AUTH_FAILED: 401,
  EMAIL_NOT_VERIFIED: 403,
  ADULT_ATTESTATION_REQUIRED: 403,
  RULES_ACCEPTANCE_REQUIRED: 403,
  PROFILE_INCOMPLETE: 403,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_RESTRICTED: 403,
  NOT_FOUND: 404,
  NOT_ALLOWED: 404,
  VALIDATION_FAILED: 400,
  HANDLE_UNAVAILABLE: 409,
  BLOCKED_RELATIONSHIP: 404,
  FRIENDSHIP_EXISTS: 409,
  RATE_LIMITED: 429,
  INVALID_TRANSITION: 409,
  GROUP_SLUG_UNAVAILABLE: 409,
  GROUP_OWNER_REQUIRED: 409,
  GROUP_BANNED: 403,
  VENUE_SLUG_UNAVAILABLE: 409,
  VENUE_DEFAULTS_INCOMPLETE: 409,
  VENUE_SPACE_OVERLAP: 409,
  MATCH_ALREADY_PLANNED: 409,
  INVITE_INVALID: 404,
  INVITE_EXPIRED: 404,
  EVENT_CANCELLED: 409,
  EVENT_STARTED: 409,
  EVENT_FULL: 409,
  ALREADY_ATTENDING: 409,
  MATERIAL_CHANGE_REQUIRES_NEW_EVENT: 409,
  LOCATION_NOT_AUTHORIZED: 404,
  SYNC_ALREADY_RUNNING: 409,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} satisfies Record<DomainErrorCode, number>;

function validationFields(error: z.ZodError): FieldErrors | undefined {
  const fields: FieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "_form";
    fields[field] ??= [];
    fields[field].push(issue.message);
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** Convert any thrown value into a browser-safe, stable application error. */
export function toActionError(error: unknown): ActionError {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: DOMAIN_ERROR_MESSAGES[error.code],
      ...(error.fields === undefined ? {} : { fields: error.fields }),
    };
  }

  if (error instanceof z.ZodError) {
    const fields = validationFields(error);

    return {
      code: "VALIDATION_FAILED",
      message: DOMAIN_ERROR_MESSAGES.VALIDATION_FAILED,
      ...(fields === undefined ? {} : { fields }),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: DOMAIN_ERROR_MESSAGES.INTERNAL_ERROR,
  };
}

export function actionFailure(error: unknown): ActionResult<never> {
  return { ok: false, error: toActionError(error) };
}

export type HttpErrorContract = Readonly<{
  status: number;
  body: Readonly<{
    error: ActionError;
    requestId: string;
  }>;
}>;

export function toHttpError(error: unknown, requestId: string): HttpErrorContract {
  const safeError = toActionError(error);

  return {
    status: HTTP_STATUS_BY_CODE[safeError.code],
    body: {
      error: safeError,
      requestId: resolveRequestId(requestId),
    },
  };
}
