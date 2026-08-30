// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
  it("has a labelled modal, closes with Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Invite people</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Invite eligible people</DialogTitle>
          <DialogDescription>Select registered supporters for this event.</DialogDescription>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "Invite people" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Invite eligible people" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
