import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), rpc: vi.fn() }));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));

import { listPeopleHub, peopleSearchQuerySchema, searchPeople } from "./search";

const personRow = {
  profile_id: "c5000000-0000-4000-8000-000000000104",
  handle: "state_team",
  display_name: "Team Person",
  city_name: "Haifa",
  reason: "You both follow Current Home FC",
  friendship_id: null,
  friendship_status: null,
  friendship_direction: null,
  relationship_created_at: null,
  total_count: 1,
};

describe("peopleSearchQuerySchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
  });

  it("requires a useful bounded query and a positive page", () => {
    expect(peopleSearchQuerySchema.safeParse({ q: "a", page: "1" }).success).toBe(false);
    expect(peopleSearchQuerySchema.safeParse({ q: "alex", page: "0" }).success).toBe(false);
    expect(peopleSearchQuerySchema.parse({ q: "  alex  ", page: "2" })).toEqual({
      q: "alex",
      page: 2,
    });
    expect(peopleSearchQuerySchema.parse({ q: "@alex", page: "1" }).q).toBe("alex");
    expect(
      peopleSearchQuerySchema.parse({ q: "alex", page: "999999999999999999999999" }).page,
    ).toBe(501);
  });

  it("loads suggestions and every relationship bucket from the canonical People projection", async () => {
    mocks.rpc.mockResolvedValue({ data: [personRow], error: null });

    await expect(listPeopleHub("suggested", "", 2)).resolves.toMatchObject({
      items: [
        {
          id: personRow.profile_id,
          handle: "state_team",
          reason: "You both follow Current Home FC",
          friendship: null,
        },
      ],
      page: 2,
      pageCount: 1,
      totalCount: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_people_hub", {
      input_query: "",
      input_bucket: "suggested",
      input_limit: 20,
      input_offset: 20,
    });
  });

  it("keeps the existing search entry point while using canonical search semantics", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          ...personRow,
          reason: null,
          friendship_id: "c5000000-0000-4000-8000-000000000601",
          friendship_status: "pending",
          friendship_direction: "sent",
        },
      ],
      error: null,
    });

    await expect(searchPeople("Team Person", 1)).resolves.toMatchObject({
      items: [
        {
          handle: "state_team",
          friendship: {
            id: "c5000000-0000-4000-8000-000000000601",
            status: "pending",
            direction: "outgoing",
          },
        },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_people_hub", {
      input_query: "Team Person",
      input_bucket: "search",
      input_limit: 20,
      input_offset: 0,
    });
  });

  it("fails closed if People output grows a private field", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...personRow, email: "must-not-cross@example.test" }],
      error: null,
    });

    await expect(listPeopleHub("suggested")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("bounds direct page inputs at the final RPC window before multiplying an offset", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await listPeopleHub("suggested", "", Number.MAX_SAFE_INTEGER);

    expect(mocks.rpc).toHaveBeenCalledWith("list_people_hub", {
      input_query: "",
      input_bucket: "suggested",
      input_limit: 20,
      input_offset: 10_000,
    });
  });

  it("fails closed on unknown buckets and query text that has no meaning for the bucket", async () => {
    await expect(listPeopleHub("unknown" as never)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(listPeopleHub("suggested", "not-empty")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(listPeopleHub("search", "x")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(listPeopleHub("search", "x".repeat(51))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mocks.requireActor).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("canonicalizes an empty high page to the final populated People page", async () => {
    mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      if (args.input_offset === 60) return { data: [], error: null };
      return { data: [{ ...personRow, total_count: 21 }], error: null };
    });

    await expect(listPeopleHub("suggested", "", 4)).resolves.toMatchObject({
      page: 2,
      pageCount: 2,
      items: [{ handle: "state_team" }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_people_hub", {
      input_query: "",
      input_bucket: "suggested",
      input_limit: 20,
      input_offset: 20,
    });
  });

  it("keeps the final bounded page reachable when the true result count exceeds the window", async () => {
    mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      if (args.input_offset === 10_000) {
        return { data: [{ ...personRow, total_count: 10_021 }], error: null };
      }
      return { data: [], error: null };
    });

    await expect(listPeopleHub("suggested", "", 501)).resolves.toMatchObject({
      page: 501,
      pageCount: 501,
      totalCount: 10_020,
      hasMoreBeyondWindow: true,
      items: [{ handle: "state_team" }],
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("list_people_hub", {
      input_query: "",
      input_bucket: "suggested",
      input_limit: 20,
      input_offset: 10_000,
    });
  });
});
