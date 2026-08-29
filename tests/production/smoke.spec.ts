import { expect, test, type Page } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing ${name} for the production smoke test.`);
  }
  return value;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  const accountNavigation = page.getByRole("button", { name: "Open account navigation" });
  await expect(accountNavigation).toBeVisible();
  await accountNavigation.click();
  await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
  await page.keyboard.press("Escape");
}

test("@session-smoke anonymous production pages and provider attribution are public", async ({
  page,
}) => {
  let providerRequestCount = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("football-data.org")) {
      providerRequestCount += 1;
    }
  });

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Huddle home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "football-data.org" })).toBeVisible();

  await page.goto("/matches");
  await expect(
    page.getByRole("heading", { name: "Find the fixture. Then find your huddle." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/catalog/i);

  await page.goto("/discover");
  await expect(
    page.getByRole("heading", { name: "Find the room where the match comes alive." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Discovery is temporarily unavailable." }),
  ).toHaveCount(0);
  const cityFallback = page.getByLabel("City fallback");
  await expect(cityFallback).toBeVisible();
  expect(await cityFallback.getByRole("option").count()).toBeGreaterThanOrEqual(13);
  await expect(cityFallback.getByRole("option", { name: "Jerusalem" })).toHaveCount(1);
  expect(providerRequestCount).toBe(0);
});

test("@session-smoke two dedicated production accounts can establish separate sessions", async ({
  browser,
}) => {
  const attendee = await browser.newPage();
  const host = await browser.newPage();
  try {
    await signIn(
      attendee,
      requiredEnvironment("HUDDLE_SMOKE_ATTENDEE_EMAIL"),
      requiredEnvironment("HUDDLE_SMOKE_ATTENDEE_PASSWORD"),
    );
    await signIn(
      host,
      requiredEnvironment("HUDDLE_SMOKE_HOST_EMAIL"),
      requiredEnvironment("HUDDLE_SMOKE_HOST_PASSWORD"),
    );
    await attendee.goto("/settings/profile");
    await host.goto("/events");
    await expect(attendee.getByRole("heading", { name: /profile/i })).toBeVisible();
    await expect(host.getByRole("heading", { name: /event/i })).toBeVisible();
  } finally {
    await attendee.close();
    await host.close();
  }
});

test("full production request approval and authorized calendar path", async ({ browser }) => {
  const eventId = requiredEnvironment("HUDDLE_SMOKE_EVENT_ID");
  const attendeeDisplayName = requiredEnvironment("HUDDLE_SMOKE_ATTENDEE_DISPLAY_NAME");
  const attendeeHandle = requiredEnvironment("HUDDLE_SMOKE_ATTENDEE_HANDLE");
  const attendee = await browser.newPage();
  const host = await browser.newPage();

  try {
    await signIn(
      attendee,
      requiredEnvironment("HUDDLE_SMOKE_ATTENDEE_EMAIL"),
      requiredEnvironment("HUDDLE_SMOKE_ATTENDEE_PASSWORD"),
    );
    await attendee.goto(`/events/${eventId}`);
    await attendee.getByRole("button", { name: "Request to attend" }).click();
    await expect(attendee.getByRole("status")).toContainText("request was sent");

    await signIn(
      host,
      requiredEnvironment("HUDDLE_SMOKE_HOST_EMAIL"),
      requiredEnvironment("HUDDLE_SMOKE_HOST_PASSWORD"),
    );
    await host.goto(`/events/${eventId}/manage`);
    const requestCard = host
      .getByRole("link", { name: `${attendeeDisplayName} · @${attendeeHandle}` })
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await requestCard.getByRole("button", { name: "Approve" }).click();
    await expect(host.getByRole("status")).toHaveText("Request approved.");

    await attendee.reload();
    const calendar = await attendee.evaluate(async (path) => {
      const response = await fetch(path);
      return { body: await response.text(), status: response.status };
    }, `/api/events/${eventId}/calendar.ics`);
    expect(calendar.status).toBe(200);
    expect(calendar.body).toContain("BEGIN:VCALENDAR");
    expect(calendar.body).toContain("LOCATION:");
  } finally {
    await attendee.close();
    await host.close();
  }
});
