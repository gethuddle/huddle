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
  await user.selectOptions(screen.getByLabelText(/Team/), teamId);
  await user.type(screen.getByLabelText(/description/i), "Match-going supporters in Haifa.");
}

describe("GroupCreateForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains the selected visibility boundary before creation", async () => {
    const user = userEvent.setup();
    render(<GroupCreateForm catalog={catalog} />);

    expect(screen.getByText(/People can find it and apply/i)).toBeVisible();
    expect(screen.getByText(/owner or admin reviews each application/i)).toBeVisible();
    expect(screen.queryByLabelText("Group URL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review group" })).toBeVisible();
    expect(screen.getByLabelText("Home area (optional)")).not.toBeRequired();
    expect(screen.queryByRole("button", { name: "Create group" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Visibility"), "unlisted");
    expect(screen.getByText(/owner or admin creates invitation links/i)).toBeVisible();
    expect(screen.getByText(/every request is still reviewed/i)).toBeVisible();
  });

  it("derives the group URL without making it another creation field", async () => {
    const user = userEvent.setup();
    render(<GroupCreateForm catalog={catalog} />);

    await user.type(screen.getByLabelText("Group name"), "Haifa Match Night");

    expect(screen.queryByLabelText("Group URL")).not.toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="slug"]')).toHaveValue(
      "haifa-match-night",
    );
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
          cityId: null,
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
    const submitted = mocks.createGroupAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("slug")).toBe("haifa-arsenal-supporters");
    expect(submitted.get("cityId")).toBe("");
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
        visibility: "discoverable",
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
    expect(screen.getByText(/share the application link/i)).toBeVisible();
    expect(screen.queryByText(/invite people and keep building/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/groups/haifa-arsenal-supporters?created=1"),
    );
  });

  it("uses invitation copy after an unlisted group is created", async () => {
    mocks.createGroupAction.mockResolvedValue({
      ok: true,
      data: {
        phase: "created",
        message: "Group created. You are its active owner.",
        visibility: "unlisted",
        group: { id: groupId, slug: "private-haifa-group", lifecycle: "forming" },
      },
    });
    const user = userEvent.setup();
    render(<GroupCreateForm catalog={catalog} />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Review group" }));

    expect(await screen.findByText(/create invitation links/i)).toBeVisible();
    expect(screen.queryByText(/share the application link/i)).not.toBeInTheDocument();
  });
});
