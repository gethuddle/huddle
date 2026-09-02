import { describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { verifyTurnstileToken } from "./turnstile";

const input = {
  token: "bounded-turnstile-token",
  expectedAction: "signup" as const,
  secret: "turnstile-secret",
  expectedHostnames: "huddle.co.il",
  remoteIp: "203.0.113.8",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Turnstile verification", () => {
  it("accepts one successful token with the expected action and hostname", async () => {
    const fetcher = vi.fn(
      async (requestInput: string | URL | Request, requestInit?: RequestInit) => {
        void requestInput;
        void requestInit;
        return response({ success: true, action: "signup", hostname: "huddle.co.il" });
      },
    );

    await expect(verifyTurnstileToken(input, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.body?.toString()).toContain("secret=turnstile-secret");
    expect(request?.body?.toString()).toContain("response=bounded-turnstile-token");
    expect(request?.body?.toString()).toContain("remoteip=203.0.113.8");
  });

  it.each([
    [{ success: false, action: "signup", hostname: "huddle.co.il" }, "provider rejection"],
    [{ success: true, action: "login", hostname: "huddle.co.il" }, "wrong action"],
    [{ success: true, action: "signup", hostname: "preview.example" }, "wrong hostname"],
    [{ success: true, action: "signup" }, "malformed response"],
  ])("fails closed for %s (%s)", async (body, label) => {
    void label;
    const fetcher = vi.fn(async () => response(body));

    await expect(verifyTurnstileToken(input, fetcher)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("fails closed on non-2xx, non-JSON, timeout/network failure, and missing configuration", async () => {
    await expect(
      verifyTurnstileToken(
        input,
        vi.fn(async () => response({}, 503)),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      verifyTurnstileToken(
        input,
        vi.fn(async () => new Response("not-json", { status: 200 })),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      verifyTurnstileToken(
        input,
        vi.fn(async () => {
          throw new Error("network details");
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      verifyTurnstileToken({ ...input, expectedHostnames: "" }, vi.fn()),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("rejects missing and oversized tokens before contacting Cloudflare", async () => {
    const fetcher = vi.fn();

    await expect(verifyTurnstileToken({ ...input, token: "" }, fetcher)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      verifyTurnstileToken({ ...input, token: "x".repeat(2049) }, fetcher),
    ).rejects.toBeInstanceOf(DomainError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
