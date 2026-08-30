// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Combobox } from "./combobox";

const options = [
  { value: "one", label: "Arsenal vs Chelsea" },
  { value: "two", label: "Liverpool vs Everton" },
  { value: "three", label: "Maccabi Haifa vs Hapoel Haifa" },
] as const;

describe("Combobox", () => {
  it("selects a filtered option with arrows and Enter while exposing active-descendant state", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Combobox
        label="Fixture"
        onValueChange={onValueChange}
        options={options}
        placeholder="Search fixtures"
        value=""
      />,
    );

    const input = screen.getByRole("combobox", { name: "Fixture" });
    await user.type(input, "haifa");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Fixture results" })).toBeVisible();

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "Maccabi Haifa vs Hapoel Haifa" }).id,
    );
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("three");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with Escape and reports a real empty result", async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        emptyText="No fixture matches that search."
        label="Fixture"
        onValueChange={vi.fn()}
        options={options}
        value=""
      />,
    );

    const input = screen.getByRole("combobox", { name: "Fixture" });
    await user.type(input, "zzzz");
    expect(screen.getByText("No fixture matches that search.")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
