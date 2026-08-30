// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AttentionItem } from "@/features/attention/types";

import { AttentionList } from "./attention-list";

const item: AttentionItem = {
  key: "friend_request:c5000000-0000-4000-8000-000000000601",
  kind: "friend_request",
  resourceId: "c5000000-0000-4000-8000-000000000102",
  href: "/people?bucket=incoming",
  title: "Friend request",
  description: "Current Fan sent you a friend request.",
  createdAt: "2026-08-30T06:00:00Z",
};

describe("AttentionList", () => {
  it("keeps each task concise and links directly to the working decision surface", () => {
    render(<AttentionList items={[item]} />);

    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
    expect(screen.getByText(item.description)).toBeVisible();
    expect(screen.getByRole("link", { name: "Review friend request" })).toHaveAttribute(
      "href",
      item.href,
    );
  });

  it("renders a calm completion state instead of an empty administration panel", () => {
    render(<AttentionList items={[]} />);

    expect(screen.getByText("You’re all caught up.")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
  });
});
