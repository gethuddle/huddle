import { describe, expect, it } from "vitest";

import {
  attendanceReviewSchema,
  attendeeRemovalSchema,
  eventCancellationSchema,
  eventPageSchema,
  invitationCreationSchema,
} from "./schemas";

const eventId = "90000000-0000-4000-8000-000000000401";
const attendanceId = "90000000-0000-4000-8000-000000000501";

describe("attendance input schemas", () => {
  it("normalizes a direct invitation handle without any guest field", () => {
    expect(invitationCreationSchema.parse({ eventId, inviteeHandle: " Supporter_One " })).toEqual({
      eventId,
      inviteeHandle: "supporter_one",
    });
  });

  it("allows only explicit attendance review decisions", () => {
    expect(
      attendanceReviewSchema.safeParse({ eventId, attendanceId, decision: "remove" }).success,
    ).toBe(false);
  });

  it("bounds removal and cancellation reasons", () => {
    expect(attendeeRemovalSchema.safeParse({ eventId, attendanceId, reason: "" }).success).toBe(
      true,
    );
    expect(eventCancellationSchema.safeParse({ eventId, reason: "no" }).success).toBe(false);
    expect(
      eventCancellationSchema.safeParse({ eventId, reason: "Host is unavailable." }).success,
    ).toBe(true);
  });

  it("uses the shared 501-page collection window for event management", () => {
    expect(eventPageSchema.parse("501")).toBe(501);
    expect(eventPageSchema.parse("502")).toBe(501);
    expect(eventPageSchema.parse("999999999999999999999999999999")).toBe(501);
    expect(eventPageSchema.parse("-4")).toBe(1);
    expect(eventPageSchema.parse("1.5")).toBe(1);
  });
});
