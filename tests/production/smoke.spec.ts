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
  await expect(page).not.toHaveURL(/\/auth\/sign-in$/);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your Huddle, in one place." })).toBeVisible();
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
  await expect(page.getByRole("status")).toContainText("Fixtures available through");

  await page.goto("/discover?city=tel-aviv-yafo");
  await expect(page.getByRole("heading", { name: "Explore watch events" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Discovery is temporarily unavailable." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Change Explore search" }).click();
  const cityFallback = page.getByRole("combobox", { name: "City" });
  await expect(cityFallback).toBeVisible();
  expect(await cityFallback.getByRole("option").count()).toBeGreaterThanOrEqual(13);
  await expect(cityFallback.getByRole("option", { name: "Jerusalem" })).toHaveCount(1);

  await page.goto("/discover?city=tel-aviv-yafo");
  const firstEvent = page.getByRole("article").first();
  const eventTitle = await firstEvent.getByRole("heading").innerText();
  await firstEvent.getByRole("link", { name: "Open event" }).click();
  const fixtureHref = await page
    .getByRole("link", { name: "← Fixture details" })
    .getAttribute("href");
  expect(fixtureHref).toMatch(/^\/matches\/[0-9a-f-]{36}$/);
  await page.goto(fixtureHref!);
  await expect(page.getByRole("link", { name: eventTitle })).toBeVisible();

  await page.goto("/groups");
  await expect(
    page.getByRole("heading", { name: "Support together, beyond match day." }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Group name" })).toBeVisible();
  expect(providerRequestCount).toBe(0);
});

test("@session-smoke two dedicated production accounts can read every redesigned workspace surface", async ({
  browser,
}) => {
  const venueSlug = requiredEnvironment("HUDDLE_SMOKE_VENUE_SLUG");
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

    await attendee.goto("/");
    await expect(
      attendee.getByRole("heading", { name: "Ready for your next match day?" }),
    ).toBeVisible();

    await attendee.goto("/discover");
    await expect(attendee.getByRole("heading", { name: "Explore watch events" })).toBeVisible();

    await attendee.goto("/dashboard");
    await expect(
      attendee.getByRole("heading", { name: "Your events, groups and saved places." }),
    ).toBeVisible();

    await attendee.goto("/people");
    await expect(attendee.getByRole("heading", { name: "People", exact: true })).toBeVisible();

    await attendee.goto("/matches");
    await expect(
      attendee.getByRole("heading", { name: "Find the fixture. Then find your huddle." }),
    ).toBeVisible();

    await host.goto(`/venues/${encodeURIComponent(venueSlug)}/workspace`);
    const venueNavigation = host.getByRole("navigation", { name: "Venue navigation" });
    await expect(venueNavigation).toBeVisible();
    await expect(venueNavigation.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(host.getByRole("link", { name: "Open public venue" })).toBeVisible();
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
