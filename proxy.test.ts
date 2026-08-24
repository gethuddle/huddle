import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "./proxy";

describe("Proxy matcher", () => {
  it.each(["/", "/dashboard", "/api/discovery"])("runs for application request %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });

  it.each(["/_next/static/app.js", "/_next/image", "/favicon.ico", "/crest.png"])(
    "skips static asset %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    },
  );
});
