// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VenueVerificationBadge } from "./venue-verification-badge";

describe("VenueVerificationBadge", () => {
  it.each([
    ["unverified", "Self-listed venue · business identity not checked by Huddle"],
    ["verified", "Business identity checked by Huddle"],
    ["suspended", "Venue unavailable"],
  ] as const)("labels %s venue identity explicitly", (status, label) => {
    render(<VenueVerificationBadge status={status} />);
    expect(screen.getByLabelText(label)).toHaveTextContent(label);
  });
});
