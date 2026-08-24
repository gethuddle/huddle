import { describe, expect, it } from "vitest";

import {
  createRequestId,
  REQUEST_ID_HEADER,
  requestIdFromHeaders,
  resolveRequestId,
} from "./index";

const existingRequestId = "5F9FECA7-3D15-4B32-9DB8-DB58C3975E0A";
const generatedRequestId = "7af34324-188e-4d88-86f0-4844283835de";

describe("request IDs", () => {
  it("propagates a valid ID in normalized form", () => {
    expect(resolveRequestId(existingRequestId)).toBe(existingRequestId.toLowerCase());
  });

  it("replaces an invalid incoming value", () => {
    expect(resolveRequestId("../../secret\nheader", () => generatedRequestId)).toBe(
      generatedRequestId,
    );
  });

  it("reads the shared header name", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: existingRequestId });
    expect(requestIdFromHeaders(headers)).toBe(existingRequestId.toLowerCase());
  });

  it("generates a valid UUID", () => {
    expect(createRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
