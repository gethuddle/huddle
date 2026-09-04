// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { VenueSpaceEditor } from "./venue-space-editor";
it("shows an expired area's retained information without mutation controls", () => {
  render(
    <VenueSpaceEditor
      venueId="venue"
      sortOrder={0}
      canEdit={false}
      space={{ id: "area", name: "Main screen", capacity: 80, active: true }}
    />,
  );
  expect(screen.getByText(/Main screen/)).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("cannot create a new space after expiry", () => {
  render(<VenueSpaceEditor venueId="venue" sortOrder={0} canEdit={false} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
