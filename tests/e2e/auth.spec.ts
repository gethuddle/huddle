import { expect, test } from "@playwright/test";

type MailpitAddress = Readonly<{ Address?: string; Email?: string }>;
type MailpitMessageSummary = Readonly<{
  ID: string;
  To?: readonly MailpitAddress[];
}>;

type MailpitMessages = Readonly<{
  messages?: readonly MailpitMessageSummary[];
}>;

type MailpitMessage = Readonly<{
  HTML?: string;
}>;

const mailpitUrl = process.env.HUDDLE_MAILPIT_URL ?? "http://127.0.0.1:54324";

async function mailpitJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, mailpitUrl), init);
  if (!response.ok) {
    throw new Error(`Local Mailpit request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function clearMailbox() {
  const response = await fetch(new URL("/api/v1/messages", mailpitUrl), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Unable to clear local Mailpit (${response.status}).`);
  }
}

function addressValue(address: MailpitAddress) {
  return address.Address ?? address.Email ?? "";
}

async function verificationUrlFor(email: string): Promise<URL> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const mailbox = await mailpitJson<MailpitMessages>("/api/v1/messages?limit=20");
    const summary = mailbox.messages?.find((message) =>
      message.To?.some(
        (recipient) => addressValue(recipient).toLowerCase() === email.toLowerCase(),
      ),
    );

    if (summary !== undefined) {
      const message = await mailpitJson<MailpitMessage>(
        `/api/v1/message/${encodeURIComponent(summary.ID)}`,
      );
      const encodedHref = message.HTML?.match(/href="([^"]+)"/)?.[1];
      if (encodedHref === undefined) {
        throw new Error("The local verification message did not contain a link.");
      }

      return new URL(encodedHref.replaceAll("&amp;", "&"));
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("The local verification message did not arrive in time.");
}

function cookiesFrom(headers: Headers, origin: string) {
  return headers.getSetCookie().map((setCookie) => {
    const pair = setCookie.split(";", 1)[0];
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex < 1) {
      throw new Error("The verification response returned an invalid cookie.");
    }
    return {
      name: pair.slice(0, separatorIndex),
      value: pair.slice(separatorIndex + 1),
      url: origin,
    };
  });
}

test("signup, email verification, SSR session, sign-in, and sign-out", async ({
  context,
  page,
}) => {
  await clearMailbox();

  const email = `b01-${Date.now()}@example.com`;
  const password = "matchday-local-test";

  await page.goto("/auth/sign-up");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("status")).toContainText("a verification link is on its way");

  const confirmationUrl = await verificationUrlFor(email);
  expect(confirmationUrl.origin).toBe("http://localhost:3000");
  expect(confirmationUrl.pathname).toBe("/auth/verify/callback");
  expect(confirmationUrl.searchParams.get("type")).toBe("email");
  expect(confirmationUrl.searchParams.has("token_hash")).toBe(true);

  const confirmationResponse = await fetch(confirmationUrl, { redirect: "manual" });
  expect(confirmationResponse.status).toBe(303);
  const confirmationLocation = confirmationResponse.headers.get("location");
  expect(confirmationLocation).toBe("http://localhost:3000/auth/verify?status=success");
  expect(confirmationLocation).not.toContain("token_hash");

  const sessionCookies = cookiesFrom(confirmationResponse.headers, confirmationUrl.origin);
  expect(sessionCookies.length).toBeGreaterThan(0);
  await context.addCookies(sessionCookies);
  await page.goto(confirmationLocation!);

  await expect(page.getByRole("heading", { name: "You’re in." })).toBeVisible();
  await expect(page.getByText("Signed in")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Signed in")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
  await expect(page.getByText("Signed in")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});
