import { DOMAIN_ERROR_CODES, DomainError, type DomainErrorCode } from "./domain";

type DatabaseErrorLike = Readonly<{
  message?: unknown;
}>;

function databaseMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const message = (error as DatabaseErrorLike).message;
  return typeof message === "string" ? message.trim() : null;
}

/** Map only exact, reviewed database error tokens into public domain failures. */
export function domainErrorFromDatabase(
  error: unknown,
  fallback: DomainErrorCode = "INTERNAL_ERROR",
): DomainError {
  const message = databaseMessage(error);
  const code = DOMAIN_ERROR_CODES.find((candidate) => candidate === message);

  return new DomainError(code ?? fallback, { cause: error });
}
