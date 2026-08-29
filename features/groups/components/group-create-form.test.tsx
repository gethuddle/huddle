// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GroupCreateForm } from "./group-create-form";

const mocks = vi.hoisted(() => ({ createGroupAction: vi.fn(), replace: vi.fn() }));

vi.mock("@/features/groups/actions", () => ({ createGroupAction: mocks.createGroupAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

const cityId = "50000000-0000-4000-8000-000000000101";
const teamId = "50000000-0000-4000-8000-000000000201";
const groupId = "50000000-0000-4000-8000-000000000301";
const catalog = {
  cities: [{ id: cityId, name: "Haifa" }],
  teams: [{ id: teamId, name: "Arsenal FC", shortName: "Arsenal" }],
};

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Group name"), "Haifa Arsenal Supporters");
  await user.clear(screen.getByLabelText("Group URL"));
  await user.type(screen.getByLabelText("Group URL"), "haifa-arsenal-supporters");
  await user.selectOptions(screen.getByLabelText("City"), cityId);
  await user.selectOptions(screen.getByLabelText(/Team/), teamId);
  await user.type(screen.getByLabelText(/Description/), "Match-going supporters in Haifa.");
}

describe("GroupCreateForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains discoverable and unlisted boundaries before creation", () => {
    render(<GroupCreateForm catalog={catalog} />);

    expect(screen.getByText(/People can find it after/i)).toBeVisible();
    expect(screen.getByText(/Only people with an invite/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Review group" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create group" })).not.toBeInTheDocument();
  });

  it("suggests a usable group URL from the name", async () => {
    const user = userEvent.setup();
    render(<GroupCreateForm catalog={catalog} />);

    await user.type(screen.getByLabelText("Group name"), "Haifa Match Night");

    expect(screen.getByLabelText("Group URL")).toHaveValue("haifa-match-night");
  });

  it("requires the similarity review before showing creation", async () => {
    mocks.createGroupAction.mockResolvedValue({
      ok: true,
      data: {
        phase: "review",
        message: "Review these discoverable groups before creating another.",
        values: {
          name: "Haifa Arsenal Supporters",
          slug: "haifa-arsenal-supporters",
          cityId,
          teamId,
          visibility: "discoverable",
          description: "Match-going supporters in Haifa.",
        },
        suggestions: [
          {
            id: groupId,
            slug: "haifa-arsenal-fans",
            name: "Haifa Arsenal Fans",
            lifecycle: "active",
            cityName: "Haifa",
            teamName: "Arsenal FC",
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<GroupCreateForm catalog={catalog} />);
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Review group" }));

    await waitFor(() => expect(mocks.createGroupAction).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Similar discoverable groups" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Haifa Arsenal Fans" })).toHaveAttribute(
      "href",
      "/groups/haifa-arsenal-fans",
    );
    expect(screen.getByRole("button", { name: "Create group" })).toBeVisible();
  });

  it("links to the group after atomic creation", async () => {
    mocks.createGroupAction.mockResolvedValue({
      ok: true,
      data: {
        phase: "created",
        message: "Group created. You are its active owner.",
        group: { id: groupId, slug: "haifa-arsenal-supporters", lifecycle: "forming" },
      },
    });
    const user = userEvent.setup();
    render(<GroupCreateForm catalog={catalog} />);
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Review group" }));

    expect(await screen.findByRole("link", { name: "Open group" })).toHaveAttribute(
      "href",
      "/groups/haifa-arsenal-supporters",
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/groups/haifa-arsenal-supporters?created=1"),
    );
  });
});
