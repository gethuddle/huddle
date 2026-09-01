import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getVenueBySlug } from "./queries";

describe("public Venue query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("maps only the controlled self-reported facilities from the safe projection", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          venue_id: "11111111-1111-4111-8111-111111111111",
          slug: "the-corner",
          name: "The Corner",
          address_text: "1 Public Street",
          description: "A public football venue in the pilot.",
          screen_count: 4,
          stated_capacity: 80,
          facilities: ["food", "drinks"],
          verification_status: "unverified",
          owner_handle: "venue_owner",
          follower_count: 3,
          viewer_follows: false,
          viewer_is_owner: false,
        },
      ],
      error: null,
    });

    await expect(getVenueBySlug("the-corner")).resolves.toMatchObject({
      facilities: ["food", "drinks"],
    });
  });
});
