import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seedCachedFixtureCatalogAfterFailure() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    throw new Error("The local service-role test environment is unavailable.");
  }

  const admin = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = new Date();
  const kickoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const windowStart = isoDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const windowEnd = isoDate(new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000));
  const beginResult = await admin.rpc("begin_sports_sync", {
    input_provider: "football-data",
    input_window_start: windowStart,
    input_window_end: windowEnd,
    input_trigger_source: "manual",
  });
  if (beginResult.error !== null) throw beginResult.error;

  const completeResult = await admin.rpc("complete_sports_sync", {
    input_run_id: beginResult.data,
    input_sport_slug: "football",
    input_competitions: [
      {
        provider_external_id: "2021",
        code: "PL",
        name: "Premier League",
        country_name: "England",
      },
    ],
    input_teams: [
      {
        provider_external_id: "57",
        name: "Arsenal FC",
        short_name: "Arsenal",
        tla: "ARS",
        country_name: "England",
      },
      {
        provider_external_id: "61",
        name: "Chelsea FC",
        short_name: "Chelsea",
        tla: "CHE",
        country_name: "England",
      },
    ],
    input_competition_teams: [
      {
        competition_external_id: "2021",
        team_external_id: "57",
        season_label: "2026",
      },
      {
        competition_external_id: "2021",
        team_external_id: "61",
        season_label: "2026",
      },
    ],
    input_matches: [
      {
        provider_external_id: "b04-e2e-match",
        competition_external_id: "2021",
        home_team_external_id: "57",
        away_team_external_id: "61",
        starts_at: kickoff.toISOString(),
        status: "timed",
        matchday: 1,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
    ],
    input_request_count: 2,
    input_retry_count: 0,
  });
  if (completeResult.error !== null) throw completeResult.error;

  const failedRun = await admin.rpc("begin_sports_sync", {
    input_provider: "football-data",
    input_window_start: windowStart,
    input_window_end: windowEnd,
    input_trigger_source: "retry",
  });
  if (failedRun.error !== null) throw failedRun.error;
  const failureResult = await admin.rpc("fail_sports_sync", {
    input_run_id: failedRun.data,
    input_request_count: 1,
    input_retry_count: 0,
    input_error_code: "UPSTREAM_5XX",
    input_error_summary: "Provider was unavailable during the test import.",
  });
  if (failureResult.error !== null) throw failureResult.error;
}

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

async function signUpAndVerify(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
) {
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
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
}

async function completeProfile(
  page: Page,
  handle: string,
  displayName: string,
  proveRequiredConfirmations = false,
) {
  await page.goto(new URL("/settings/profile", page.url()).toString());
  await page.getByRole("textbox", { name: "Display name" }).fill(displayName);
  await page.getByRole("textbox", { name: "Handle" }).fill(handle);
  await page.getByRole("combobox", { name: "Israel city" }).selectOption("haifa");

  if (proveRequiredConfirmations) {
    await page.getByRole("button", { name: "Complete profile" }).click();
    await expect(page.getByText("This confirmation is required.")).toHaveCount(2);
  }

  await page.getByRole("checkbox", { name: /18 or older/i }).click();
  await page.getByRole("checkbox", { name: /accept the current/i }).click();
  await page.getByRole("button", { name: "Complete profile" }).click();

  await expect(page).toHaveURL(new RegExp(`/people/${handle}$`));
  await expect(page.getByRole("heading", { name: displayName })).toBeVisible();
}

test("signup, verification, onboarding, SSR session, sign-in, and sign-out", async ({
  context,
  page,
}) => {
  await clearMailbox();

  const suffix = Date.now();
  const email = `b02-${suffix}@example.com`;
  const password = "matchday-local-test";
  const handle = `fan_${suffix.toString().slice(-8)}`;

  await signUpAndVerify(page, context, email, password);
  await expect(page.getByRole("link", { name: "Complete your profile" })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
  await completeProfile(page, handle, "Local Fan", true);

  await expect(page.getByText("This is your public profile.")).toBeVisible();
  await expect(page.getByText(email)).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Sign in for community controls.")).toBeVisible();

  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});

test("a block is private, directional, auditable, and reversible", async ({
  browser,
  context,
  page,
}) => {
  await clearMailbox();

  const suffix = Date.now().toString().slice(-8);
  const password = "matchday-local-test";
  const firstEmail = `blocker-${suffix}@example.com`;
  const secondEmail = `target-${suffix}@example.com`;
  const firstHandle = `blocker_${suffix}`;
  const secondHandle = `target_${suffix}`;

  await signUpAndVerify(page, context, firstEmail, password);
  await completeProfile(page, firstHandle, "Blocking Fan");

  const secondContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const secondPage = await secondContext.newPage();

  try {
    await signUpAndVerify(secondPage, secondContext, secondEmail, password);
    await completeProfile(secondPage, secondHandle, "Target Fan");

    await page.goto(new URL(`/people/${secondHandle}`, page.url()).toString());
    await page.getByRole("button", { name: "Add friend" }).click();
    await expect(page.getByRole("status")).toHaveText("Friend request sent.");
    await expect(page.getByText("Request sent", { exact: true })).toBeVisible();

    await secondPage.goto(new URL(`/people/${firstHandle}`, secondPage.url()).toString());
    await expect(secondPage.getByText(`@${firstHandle} sent you a friend request.`)).toBeVisible();
    await secondPage.getByRole("button", { name: "Accept" }).click();
    await expect(secondPage.getByRole("status")).toHaveText("Friend request accepted.");
    await expect(
      secondPage
        .getByRole("complementary", { name: "Community controls" })
        .getByText("Friends", { exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page
        .getByRole("complementary", { name: "Community controls" })
        .getByText("Friends", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Block @${secondHandle}` }).click();
    await expect(page.getByRole("alertdialog")).toContainText("They will not be notified");
    await page.getByRole("button", { name: "Confirm block" }).click();
    await expect(page.getByRole("status")).toHaveText("Safety preference updated.");
    await expect(page.getByRole("button", { name: `Unblock @${secondHandle}` })).toBeVisible();
    await expect(page.getByText("Direct interaction is paused.")).toBeVisible();
    await expect(
      page
        .getByRole("complementary", { name: "Community controls" })
        .getByText("Friends", { exact: true }),
    ).toHaveCount(0);

    await secondPage.goto(new URL(`/people/${firstHandle}`, secondPage.url()).toString());
    await expect(secondPage.getByRole("button", { name: `Block @${firstHandle}` })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "Add friend" })).toBeVisible();
    await expect(secondPage.getByText(/blocked you/i)).toHaveCount(0);

    await page.getByRole("button", { name: `Unblock @${secondHandle}` }).click();
    await expect(page.getByRole("status")).toHaveText("Safety preference updated.");
    await expect(page.getByRole("button", { name: `Block @${secondHandle}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add friend" })).toBeVisible();

    await page.getByRole("button", { name: `Block @${secondHandle}` }).click();
    await expect(page.getByRole("alertdialog")).toContainText("They will not be notified");
    await page.getByRole("button", { name: "Confirm block" }).click();
    await expect(page.getByRole("status")).toHaveText("Safety preference updated.");
    await expect(page.getByRole("button", { name: `Unblock @${secondHandle}` })).toBeVisible();
  } finally {
    await secondContext.close();
  }
});

test("a completed user checks similar groups and becomes the atomic owner", async ({
  context,
  page,
}) => {
  await clearMailbox();

  const suffix = Date.now().toString().slice(-8);
  const email = `group-owner-${suffix}@example.com`;
  const password = "matchday-local-test";
  const handle = `owner_${suffix}`;
  const slug = `haifa-huddle-${suffix}`;

  await signUpAndVerify(page, context, email, password);
  await completeProfile(page, handle, "Group Owner");
  await page.goto(new URL("/groups/new", page.url()).toString());

  await page.getByRole("textbox", { name: "Group name" }).fill(`Haifa Huddle ${suffix}`);
  await page.getByRole("textbox", { name: "Group URL" }).fill(slug);
  await page.getByRole("combobox", { name: "Israel city" }).selectOption({ label: "Haifa" });
  await page
    .getByRole("textbox", { name: /Description/ })
    .fill("A local group for respectful match-day gatherings.");
  await page.getByRole("button", { name: "Check similar groups" }).click();

  await expect(page.getByRole("status")).toContainText(
    /No similar discoverable groups found|Review these discoverable groups/,
  );
  await expect(page.getByRole("button", { name: "Create group" })).toBeVisible();
  await page.getByRole("button", { name: "Create group" }).click();

  await expect(page.getByRole("heading", { name: "You own this group." })).toBeVisible();
  await page.getByRole("link", { name: "Open group" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${slug}$`));
  await expect(page.getByRole("heading", { name: `Haifa Huddle ${suffix}` })).toBeVisible();
  await expect(page.getByText("Your role: owner")).toBeVisible();
  await expect(page.getByText("Forming privately")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active members" })).toBeVisible();
  await expect(page.getByText("Group Owner")).toBeVisible();
});

test("cached fixtures survive provider failure and a completed user follows a team", async ({
  context,
  page,
}) => {
  await clearMailbox();
  await seedCachedFixtureCatalogAfterFailure();

  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("football-data.org")) providerRequests.push(request.url());
  });

  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: /Find the fixture/i })).toBeVisible();
  await expect(page.getByText("Arsenal", { exact: true })).toBeVisible();
  await expect(page.getByText("Chelsea", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Fixture data was updated");
  expect(providerRequests).toEqual([]);

  await page.getByRole("link", { name: "View Arsenal FC versus Chelsea FC" }).click();
  await expect(page.getByRole("heading", { name: "Arsenal vs Chelsea" })).toBeVisible();
  await expect(page.getByText("No Huddle watch events yet.")).toBeVisible();
  expect(providerRequests).toEqual([]);

  const suffix = Date.now().toString().slice(-8);
  const email = `follow-${suffix}@example.com`;
  const password = "matchday-local-test";
  const handle = `follow_${suffix}`;
  await signUpAndVerify(page, context, email, password);
  await completeProfile(page, handle, "Following Fan");

  await page.goto(new URL("/settings/interests", page.url()).toString());
  await page.getByRole("button", { name: "Follow Arsenal" }).click();
  await expect(page.getByRole("status")).toHaveText("Follow added.");
  await expect(page.getByRole("button", { name: "Unfollow Arsenal" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByRole("button", { name: "Unfollow Arsenal" })).toBeVisible();
});
