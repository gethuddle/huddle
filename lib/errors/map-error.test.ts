import { z } from "zod";
import { describe, expect, it } from "vitest";

import { DomainError } from "./domain";
import { actionFailure, toActionError, toHttpError } from "./map-error";
import { actionSuccess } from "./result";

describe("safe error contracts", () => {
  it("creates a discriminated success result", () => {
    expect(actionSuccess({ id: "event-id" })).toEqual({
      ok: true,
      data: { id: "event-id" },
    });
  });

  it("maps expected domain errors to centrally controlled messages", () => {
    const secretCause = new Error("SQL policy private_locations denied token=secret");

    expect(
      actionFailure(new DomainError("LOCATION_NOT_AUTHORIZED", { cause: secretCause })),
    ).toEqual({
      ok: false,
      error: {
        code: "LOCATION_NOT_AUTHORIZED",
        message: "The event location is not available.",
      },
    });
  });

  it("maps Zod issues into field errors", () => {
    const schema = z.object({ displayName: z.string().min(2) });
    const result = schema.safeParse({ displayName: "" });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(toActionError(result.error)).toMatchObject({
      code: "VALIDATION_FAILED",
      fields: {
        displayName: [expect.any(String)],
      },
    });
  });

  it("never returns unexpected stack, SQL, policy, or secret details", () => {
    const unsafeMessage =
      "duplicate key violates SQL policy event_private_locations token=SUPER_SECRET";
    const unsafeError = new Error(unsafeMessage);
    unsafeError.stack = `Error: ${unsafeMessage}\n at private-function.ts:42`;

    const serialized = JSON.stringify(actionFailure(unsafeError));

    expect(serialized).toBe(
      '{"ok":false,"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. Try again."}}',
    );
    expect(serialized).not.toContain("SQL");
    expect(serialized).not.toContain("policy");
    expect(serialized).not.toContain("SUPER_SECRET");
    expect(serialized).not.toContain("private-function");
  });

  it("maps HTTP status and includes only the propagated request ID", () => {
    const requestId = "7af34324-188e-4d88-86f0-4844283835de";

    expect(toHttpError(new DomainError("EVENT_FULL"), requestId)).toEqual({
      status: 409,
      body: {
        error: {
          code: "EVENT_FULL",
          message: "This event is full.",
        },
        requestId,
      },
    });
  });

  it("replaces an unsafe request ID before returning an HTTP contract", () => {
    const contract = toHttpError(new Error("private detail"), "bad\nrequest-id");

    expect(contract.body.requestId).not.toBe("bad\nrequest-id");
    expect(contract.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
