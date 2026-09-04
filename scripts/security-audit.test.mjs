import { describe, expect, it } from "vitest";

import { auditSourceFile, secretNames } from "./security-audit.mjs";

describe("Polar source security audit", () => {
  it.each([
    ["components/leak.tsx", '"use client"; const token = process.env.POLAR_ACCESS_TOKEN;'],
    ["features/bad.ts", "console.log(process.env.POLAR_WEBHOOK_SECRET);"],
    ["features/bad.ts", "console.log({ token: environment.POLAR_ACCESS_TOKEN });"],
    ["features/bad.ts", "const token = process.env.POLAR_ACCESS_TOKEN; console.log(token);"],
    [
      "features/bad.ts",
      "const { POLAR_WEBHOOK_SECRET: secret } = process.env; console.error(secret);",
    ],
    ["features/bad.ts", 'import { createPolar } from "@polar-sh/sdk/2026-04";'],
    [".env.example", "NEXT_PUBLIC_POLAR_ACCESS_TOKEN=replace-with-token"],
    [".env.preview.example", "POLAR_ACCESS_TOKEN=polar_oat_actual-credential-value"],
    [".env.example", "POLAR_WEBHOOK_SECRET=whsec_committed-provider-secret"],
    ["features/bad.ts", 'const credential = "polar_oat_actual-credential-value";'],
    ["features/venue-billing/actions.ts", 'import { erasePolarExternalCustomer } from "./polar";'],
    ["features/venue-billing/actions.ts", 'import * as polar from "./polar";'],
    ["features/venue-billing/actions.ts", 'export * from "./polar";'],
    ["features/venue-billing/actions.ts", 'const polar = await import("./polar");'],
    [
      "features/venue-billing/polar.ts",
      'import "server-only"; import { createPolar } from "@polar-sh/sdk";',
    ],
    [
      "features/venue-billing/webhook.ts",
      'import "server-only"; import { createPolar } from "@polar-sh/sdk/2026-04";',
    ],
    [
      "components/bad.tsx",
      '"use client"; import { getVenueCheckout } from "@/features/venue-billing/polar";',
    ],
  ])("rejects forbidden source in %s", (path, source) => {
    const findings = auditSourceFile(path, source);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.join(" ")).not.toContain("actual-credential-value");
  });
  it("allows the server-only adapter and non-secret placeholders", () => {
    expect(
      auditSourceFile(
        "features/venue-billing/polar.ts",
        'import "server-only"; import { createPolar } from "@polar-sh/sdk/2026-04";',
      ),
    ).toEqual([]);
    expect(
      auditSourceFile(".env.example", "POLAR_ACCESS_TOKEN=replace-with-sandbox-token"),
    ).toEqual([]);
  });
  it("allows erasure only in the planned reauthenticated action and late webhook cleanup", () => {
    expect(
      auditSourceFile(
        "features/account-erasure/actions.ts",
        'import { erasePolarExternalCustomer } from "@/features/venue-billing/polar";',
      ),
    ).toEqual([]);
    expect(
      auditSourceFile(
        "features/venue-billing/webhook.ts",
        'import "server-only"; import { erasePolarExternalCustomer } from "./polar";',
      ),
    ).toEqual([]);
    expect(
      auditSourceFile(
        "features/venue-billing/webhook.ts",
        'import "server-only"; import { webhooks } from "@polar-sh/sdk/2026-04";',
      ),
    ).toEqual([]);
  });
});

describe("security audit secret inventory", () => {
  it("includes every Auth hardening secret", () => {
    expect(secretNames).toEqual(
      expect.arrayContaining(["AUTH_RECOVERY_TOKEN_SECRET", "TURNSTILE_SECRET"]),
    );
  });
});
