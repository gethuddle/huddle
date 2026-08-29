import { describe, expect, it } from "vitest";

import { peopleSearchQuerySchema } from "./search";

describe("peopleSearchQuerySchema", () => {
  it("requires a useful bounded query and a positive page", () => {
    expect(peopleSearchQuerySchema.safeParse({ q: "a", page: "1" }).success).toBe(false);
    expect(peopleSearchQuerySchema.safeParse({ q: "alex", page: "0" }).success).toBe(false);
    expect(peopleSearchQuerySchema.parse({ q: "  alex  ", page: "2" })).toEqual({
      q: "alex",
      page: 2,
    });
    expect(peopleSearchQuerySchema.parse({ q: "@alex", page: "1" }).q).toBe("alex");
  });
});
