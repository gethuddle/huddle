import type { DomainErrorCode, FieldErrors } from "./domain";

export type ActionError = Readonly<{
  code: DomainErrorCode;
  message: string;
  fields?: FieldErrors;
}>;

export type ActionResult<T> =
  Readonly<{ ok: true; data: T }> | Readonly<{ ok: false; error: ActionError }>;

export function actionSuccess<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
