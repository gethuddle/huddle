// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VenueFacilities } from "./venue-facilities";

describe("VenueFacilities", () => {
  it("labels controlled facility claims as self-reported", () => {
    render(<VenueFacilities facilities={["food", "wheelchair_accessible"]} />);

    expect(screen.getByText("Self-reported venue facilities")).toBeVisible();
    expect(screen.getByText("Food")).toBeVisible();
    expect(screen.getByText("Wheelchair accessible")).toBeVisible();
    expect(screen.queryByText(/available now/i)).not.toBeInTheDocument();
  });

  it("renders nothing when a Venue lists no facilities", () => {
    const { container } = render(<VenueFacilities facilities={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
