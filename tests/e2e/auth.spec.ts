import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import path from "node:path";

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
const captureB08Evidence = process.env.HUDDLE_CAPTURE_B08_EVIDENCE === "1";
const captureB09Evidence = process.env.HUDDLE_CAPTURE_B09_EVIDENCE === "1";
const captureB10Evidence = process.env.HUDDLE_CAPTURE_B10_EVIDENCE === "1";
const captureB11Evidence = process.env.HUDDLE_CAPTURE_B11_EVIDENCE === "1";

function localAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    throw new Error("The local service-role test environment is unavailable.");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function localDatabaseQuery(sql: string) {
  const executable = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  execFileSync(executable, ["db", "query", "--local", sql], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function seedCompletedUser(
  email: string,
  password: string,
  handle: string,
  displayName: string,
) {
  const admin = localAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError !== null) throw createError;

  const completedAt = new Date().toISOString();
  localDatabaseQuery(`
    update public.profiles
    set adult_attested_at = ${sqlLiteral(completedAt)}::timestamptz,
        city_id = '00000000-0000-4000-8000-000000000003'::uuid,
        display_name = ${sqlLiteral(displayName)},
        handle = ${sqlLiteral(handle)},
        profile_completed_at = ${sqlLiteral(completedAt)}::timestamptz,
        rules_accepted_at = ${sqlLiteral(completedAt)}::timestamptz,
        rules_version = 1
    where id = ${sqlLiteral(created.user.id)}::uuid;
  `);

  return created.user.id;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
}

async function seedGroupOwner(ownerId: string, suffix: string) {
  const slug = `safety-circle-${suffix}`;
  const reviewedAt = new Date().toISOString();
  localDatabaseQuery(`
    with new_group as (
      insert into public.groups (
        city_id, description, lifecycle, name, owner_id, slug, visibility
      ) values (
        '00000000-0000-4000-8000-000000000003'::uuid,
        'A deterministic group proving group administrators cannot inspect reports.',
        'forming',
        ${sqlLiteral(`Safety Circle ${suffix}`)},
        ${sqlLiteral(ownerId)}::uuid,
        ${sqlLiteral(slug)},
        'unlisted'
      )
      returning id
    )
    insert into public.group_memberships (
      group_id, reviewed_at, reviewed_by, role, status, user_id
    )
    select
      id,
      ${sqlLiteral(reviewedAt)}::timestamptz,
      ${sqlLiteral(ownerId)}::uuid,
      'owner',
      'active',
      ${sqlLiteral(ownerId)}::uuid
    from new_group;
  `);

  return slug;
}

async function seedCachedFixtureCatalogAfterFailure() {
  const admin = localAdminClient();
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

async function addReviewedGroupMembers(
  browser: Browser,
  ownerPage: Page,
  groupSlug: string,
  suffix: string,
  password: string,
  count: number,
) {
  for (let index = 1; index <= count; index += 1) {
    const memberContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    const memberPage = await memberContext.newPage();
    const applicationNote = `Discovery gate application ${index}.`;

    try {
      await signUpAndVerify(
        memberPage,
        memberContext,
        `gate-member-${suffix}-${index}@example.com`,
        password,
      );
      await completeProfile(memberPage, `gate_${suffix}_${index}`, `Gate Member ${index}`);
      await memberPage.goto(new URL(`/groups/${groupSlug}`, memberPage.url()).toString());
      await memberPage
        .getByRole("textbox", { name: /Note to the administrators/ })
        .fill(applicationNote);
      await memberPage.getByRole("button", { name: "Apply to join" }).click();
      await expect(memberPage.getByText("Application: pending")).toBeVisible();

      await ownerPage.goto(
        new URL(`/groups/${groupSlug}/manage?section=applications`, ownerPage.url()).toString(),
      );
      await expect(ownerPage.getByText(applicationNote)).toBeVisible();
      await ownerPage.getByRole("button", { name: "Approve" }).click();
      await expect(
        ownerPage.getByRole("heading", { name: "No pending applications." }),
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }
  }
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

test("a completed user creates and administers reviewed group membership", async ({
  browser,
  context,
  page,
}) => {
  // This integrated G06/E05/E07 journey deliberately provisions six verified accounts.
  test.setTimeout(90_000);

  await clearMailbox();
  await seedCachedFixtureCatalogAfterFailure();

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
  await expect(page.getByText("Forming and accepting applications")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active members" })).toBeVisible();
  await expect(page.getByText("Group Owner")).toBeVisible();

  await page.getByRole("link", { name: "Manage group" }).click();
  await page.getByRole("link", { name: "Rules" }).click();
  await page.getByRole("textbox", { name: "New plain-text rule" }).fill("Respect every supporter.");
  await page.getByRole("checkbox", { name: "Publish immediately" }).click();
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByRole("status")).toHaveText("Published rule added.");
  await expect(page.getByRole("textbox", { name: "Rule text" })).toHaveValue(
    "Respect every supporter.",
  );

  const applicantContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const applicantPage = await applicantContext.newPage();
  const applicantEmail = `group-applicant-${suffix}@example.com`;
  const applicantHandle = `applicant_${suffix}`;

  try {
    await signUpAndVerify(applicantPage, applicantContext, applicantEmail, password);
    await completeProfile(applicantPage, applicantHandle, "Group Applicant");
    await applicantPage.goto(new URL(`/groups/${slug}`, applicantPage.url()).toString());
    await expect(applicantPage.getByText("Forming and accepting applications")).toBeVisible();
    await expect(applicantPage.getByText("Respect every supporter.")).toBeVisible();
    await applicantPage
      .getByRole("textbox", { name: /Note to the administrators/ })
      .fill("I would like to help this group grow.");
    await applicantPage.getByRole("button", { name: "Apply to join" }).click();
    await expect(applicantPage.getByText("Application: pending")).toBeVisible();
    await expect(applicantPage.getByText(/application is waiting for an owner/i)).toBeVisible();

    await page.goto(new URL(`/groups/${slug}/manage?section=applications`, page.url()).toString());
    await expect(page.getByText("I would like to help this group grow.")).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("heading", { name: "No pending applications." })).toBeVisible();

    await applicantPage.goto(new URL(`/groups/${slug}`, applicantPage.url()).toString());
    await expect(applicantPage.getByText("Your role: member")).toBeVisible();
    await expect(applicantPage.getByRole("heading", { name: "Active members" })).toBeVisible();

    const exactGroupEventAddress = `88 Protected Group Home ${suffix}, Haifa`;
    const groupEventTitle = `Member match night ${suffix}`;
    await applicantPage.goto(new URL("/events/new", applicantPage.url()).toString());
    await applicantPage
      .getByRole("combobox", { name: "Future fixture" })
      .selectOption({ index: 1 });
    await applicantPage.getByRole("textbox", { name: "Event title" }).fill(groupEventTitle);
    await applicantPage.getByRole("combobox", { name: "City" }).selectOption({ label: "Haifa" });
    await applicantPage
      .getByRole("textbox", { name: "Description" })
      .fill("A protected group watch party submitted by an active member for review.");
    await applicantPage
      .getByRole("textbox", { name: "Exact home address" })
      .fill(exactGroupEventAddress);
    await applicantPage.getByRole("spinbutton", { name: "Longitude" }).fill("34.99800");
    await applicantPage.getByRole("spinbutton", { name: "Latitude" }).fill("32.81200");
    await applicantPage.getByRole("radio", { name: /Supporter group/ }).click();
    await applicantPage
      .getByRole("combobox", { name: "Audience group" })
      .selectOption({ label: `Haifa Huddle ${suffix} (forming)` });
    await applicantPage
      .getByRole("combobox", { name: "Organizing group \(optional\)" })
      .selectOption({ label: `Haifa Huddle ${suffix} (forming)` });
    await applicantPage.getByRole("checkbox", { name: /I confirm that I am the host/i }).click();
    await applicantPage.getByRole("button", { name: "Submit for group review" }).click();
    await expect(
      applicantPage.getByText("Event submitted to its organizing group for review."),
    ).toBeVisible();
    await expect(applicantPage.getByText(exactGroupEventAddress)).toHaveCount(0);

    await page.goto(new URL(`/groups/${slug}/manage?section=events`, page.url()).toString());
    await expect(page.getByRole("link", { name: groupEventTitle })).toBeVisible();
    await expect(page.getByText("pending group review")).toBeVisible();
    if (captureB08Evidence) {
      await page.screenshot({
        fullPage: true,
        path: "docs/evidence/b08/group-event-review-desktop.png",
      });
    }
    await page.getByRole("button", { name: "Approve and publish" }).click();
    await expect(page.getByText("published", { exact: true })).toBeVisible();

    await applicantPage.getByRole("link", { name: "Open safe event summary" }).click();
    await expect(applicantPage.getByRole("heading", { name: groupEventTitle })).toBeVisible();
    await expect(applicantPage.getByText("published", { exact: true })).toBeVisible();
    await expect(applicantPage.getByText(new RegExp(exactGroupEventAddress))).toBeVisible();
    await applicantPage.goto(new URL(`/groups/${slug}`, applicantPage.url()).toString());
    await expect(applicantPage.getByRole("link", { name: groupEventTitle })).toBeVisible();

    await applicantPage.goto(
      new URL(
        `/groups?q=${encodeURIComponent(`Haifa Huddle ${suffix}`)}`,
        applicantPage.url(),
      ).toString(),
    );
    await expect(applicantPage.getByText(`Haifa Huddle ${suffix}`, { exact: true })).toHaveCount(0);

    await page.goto(new URL(`/groups/${slug}/manage?section=members`, page.url()).toString());
    await expect(page.getByText("Still forming", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Member role" }).selectOption("admin");
    await page.getByRole("button", { name: "Save role" }).click();
    await expect(page.getByRole("status")).toHaveText("Member promoted to admin.");

    await addReviewedGroupMembers(browser, page, slug, suffix, password, 3);
    await page.reload();
    await expect(page.getByText("Visible in group search", { exact: true })).toBeVisible();
    await expect(page.getByText("5 of 5 eligible active members", { exact: true })).toBeVisible();
    if (captureB09Evidence) {
      await page.screenshot({
        fullPage: true,
        path: "docs/evidence/b09/group-discovery-gate-desktop.png",
      });
    }

    await applicantPage.goto(new URL(`/groups/${slug}`, applicantPage.url()).toString());
    await expect(applicantPage.getByText("Your role: admin")).toBeVisible();
    await expect(applicantPage.getByRole("link", { name: "Manage group" })).toBeVisible();

    await applicantPage.goto(
      new URL(
        `/groups?q=${encodeURIComponent(`Haifa Huddle ${suffix}`)}`,
        applicantPage.url(),
      ).toString(),
    );
    await expect(applicantPage.getByText(`Haifa Huddle ${suffix}`, { exact: true })).toBeVisible();

    await applicantPage.goto(new URL("/discover?city=haifa", applicantPage.url()).toString());
    await expect(applicantPage.getByText(groupEventTitle, { exact: true })).toBeVisible();
    await expect(applicantPage.getByText(exactGroupEventAddress)).toHaveCount(0);
    expect(await applicantPage.content()).not.toContain(exactGroupEventAddress);
    if (captureB09Evidence) {
      await applicantPage.screenshot({
        fullPage: true,
        path: "docs/evidence/b09/personalized-discovery-desktop.png",
      });
    }

    const unlistedSlug = `haifa-private-${suffix}`;
    await page.goto(new URL("/groups/new", page.url()).toString());
    await page.getByRole("textbox", { name: "Group name" }).fill(`Haifa Private Circle ${suffix}`);
    await page.getByRole("textbox", { name: "Group URL" }).fill(unlistedSlug);
    await page.getByRole("combobox", { name: "Israel city" }).selectOption({ label: "Haifa" });
    await page.getByRole("combobox", { name: "Visibility" }).selectOption("unlisted");
    await page
      .getByRole("textbox", { name: /Description/ })
      .fill("An unlisted circle with reviewed invitation applications.");
    await page.getByRole("button", { name: "Check similar groups" }).click();
    await expect(page.getByRole("button", { name: "Create group" })).toBeVisible();
    await page.getByRole("button", { name: "Create group" }).click();
    await page.getByRole("link", { name: "Open group" }).click();
    await page.getByRole("link", { name: "Manage group" }).click();
    await page.getByRole("link", { name: "Invitations" }).click();
    await page.getByRole("button", { name: "Create invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Copy it now");
    const inviteUrl = await page.getByRole("textbox", { name: "New invitation URL" }).inputValue();
    expect(inviteUrl).toMatch(/\/join\/group\/[A-Za-z0-9_-]{43}$/);

    const inviteeContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    const inviteePage = await inviteeContext.newPage();
    const inviteeEmail = `group-invitee-${suffix}@example.com`;
    const inviteeHandle = `invitee_${suffix}`;

    try {
      await signUpAndVerify(inviteePage, inviteeContext, inviteeEmail, password);
      await completeProfile(inviteePage, inviteeHandle, "Invited Applicant");
      await inviteePage.goto(inviteUrl);
      await expect(
        inviteePage.getByRole("heading", { name: `Haifa Private Circle ${suffix}` }),
      ).toBeVisible();
      await expect(inviteePage.getByText("Administrator review required")).toBeVisible();
      await inviteePage
        .getByRole("textbox", { name: /Note to the administrators/ })
        .fill("I received this invitation from the group.");
      await inviteePage.getByRole("button", { name: "Request to join" }).click();
      await expect(
        inviteePage.getByRole("heading", { name: "Your application is pending." }),
      ).toBeVisible();

      await page.goto(
        new URL(`/groups/${unlistedSlug}/manage?section=applications`, page.url()).toString(),
      );
      await expect(page.getByText("I received this invitation from the group.")).toBeVisible();
      await page.getByRole("button", { name: "Approve" }).click();
      await expect(page.getByRole("heading", { name: "No pending applications." })).toBeVisible();

      await inviteePage.goto(new URL(`/groups/${unlistedSlug}`, inviteePage.url()).toString());
      await expect(inviteePage.getByText("Your role: member")).toBeVisible();

      await page.goto(
        new URL(`/groups/${unlistedSlug}/manage?section=invites`, page.url()).toString(),
      );
      await page.getByRole("button", { name: "Revoke" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
      await expect(page.getByText("revoked", { exact: true })).toBeVisible();

      await inviteePage.reload();
      await expect(inviteePage.getByText("Your role: member")).toBeVisible();
    } finally {
      await inviteeContext.close();
    }
  } finally {
    await applicantContext.close();
  }
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

test("completed users create venue and private events with safe projections", async ({
  browser,
  context,
  page,
}) => {
  await clearMailbox();
  await seedCachedFixtureCatalogAfterFailure();

  const suffix = Date.now().toString().slice(-8);
  const email = `b07-host-${suffix}@example.com`;
  const password = "matchday-local-test";
  const handle = `b07_host_${suffix}`;
  const venueSlug = `match-corner-${suffix}`;
  const exactHomeAddress = `99 Protected Home ${suffix}, Haifa`;

  await signUpAndVerify(page, context, email, password);
  await completeProfile(page, handle, "B07 Host");

  await page.goto(new URL("/venues/new", page.url()).toString());
  await page.getByRole("textbox", { name: "Venue name" }).fill(`Match Corner ${suffix}`);
  await page.getByRole("textbox", { name: "Venue URL" }).fill(venueSlug);
  await page.getByRole("combobox", { name: "Israel city" }).selectOption({ label: "Haifa" });
  await page.getByRole("textbox", { name: "Public address" }).fill("12 Hanassi Boulevard, Haifa");
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("32.81303");
  await page.getByRole("spinbutton", { name: "Longitude" }).fill("34.99928");
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A local match-day venue with several screens and accessible seating.");
  await page.getByRole("spinbutton", { name: /Screen count/ }).fill("4");
  await page.getByRole("spinbutton", { name: /Stated capacity/ }).fill("80");
  await page.getByRole("button", { name: "Create unverified venue" }).click();

  await expect(page.getByRole("heading", { name: "Your venue profile is live." })).toBeVisible();
  await expect(page.getByText(/Unverified remains visible/i)).toBeVisible();
  await page.getByRole("link", { name: "Open venue" }).click();
  await expect(page).toHaveURL(new RegExp(`/venues/${venueSlug}$`));
  await expect(page.getByLabel("Unverified venue")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage venue" })).toBeVisible();

  const venueEventTitle = `Arsenal at Match Corner ${suffix}`;
  await page.getByRole("link", { name: "Create venue event" }).click();
  await page.getByRole("combobox", { name: "Future fixture" }).selectOption({ index: 1 });
  await page.getByRole("textbox", { name: "Event title" }).fill(venueEventTitle);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A public business-venue listing for registered supporters to watch the full match.");
  await expect(page.getByRole("checkbox", { name: /Require staff approval/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /venue staff will host/i }).click();
  await page.getByRole("button", { name: "Publish venue event" }).click();
  await expect(page.getByText("Venue event published for safe public browsing.")).toBeVisible();
  const venueEventHref = await page.getByRole("link", { name: "Open event" }).getAttribute("href");
  expect(venueEventHref).toMatch(/^\/events\/[0-9a-f-]+$/);

  const anonymousContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const anonymousPage = await anonymousContext.newPage();
  try {
    await anonymousPage.goto(venueEventHref!);
    await expect(anonymousPage.getByRole("heading", { name: venueEventTitle })).toBeVisible();
    await expect(anonymousPage.getByLabel("Unverified venue").first()).toBeVisible();
    await expect(anonymousPage.getByText("Immediate join", { exact: true })).toBeVisible();
    await expect(anonymousPage.getByText("No cover charge", { exact: true })).toBeVisible();
    if (captureB08Evidence) {
      await anonymousPage.screenshot({
        fullPage: true,
        path: "docs/evidence/b08/anonymous-venue-event-desktop.png",
      });
    }
    await anonymousPage.goto(new URL(`/venues/${venueSlug}`, anonymousPage.url()).toString());
    await expect(anonymousPage.getByRole("link", { name: venueEventTitle })).toBeVisible();
    await anonymousPage.goto(new URL("/discover?city=haifa", anonymousPage.url()).toString());
    await expect(anonymousPage.getByText(venueEventTitle, { exact: true })).toBeVisible();
    await expect(anonymousPage.getByText("Using city fallback", { exact: true })).toBeVisible();
    if (captureB09Evidence) {
      await anonymousPage.screenshot({
        fullPage: true,
        path: "docs/evidence/b09/anonymous-discovery-desktop.png",
      });
    }
  } finally {
    await anonymousContext.close();
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  const privateEmail = `b08-private-host-${suffix}@example.com`;
  const privateHandle = `private_${suffix}`;
  await signUpAndVerify(page, context, privateEmail, password);
  await completeProfile(page, privateHandle, "Private Event Host");

  await page.goto(new URL("/matches", page.url()).toString());
  await page.getByRole("link", { name: "View Arsenal FC versus Chelsea FC" }).click();
  await page.getByRole("link", { name: "Host a private event" }).click();
  await expect(page).toHaveURL(/\/events\/new\?matchId=/);

  await page.getByRole("textbox", { name: "Event title" }).fill(`Arsenal at home ${suffix}`);
  await page.getByRole("combobox", { name: "City" }).selectOption({ label: "Haifa" });
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A calm home watch party for registered supporters during the full match.");
  await page.getByRole("textbox", { name: "Exact home address" }).fill(exactHomeAddress);
  await page.getByRole("spinbutton", { name: "Longitude" }).fill("34.99800");
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("32.81200");
  await page.getByRole("checkbox", { name: /I confirm that I am the host/i }).click();
  await page.getByRole("button", { name: "Publish event" }).click();

  await expect(page.getByText("Private event published to its eligible audience.")).toBeVisible();
  await expect(page.getByText(exactHomeAddress)).toHaveCount(0);
  await page.getByRole("link", { name: "Open safe event summary" }).click();
  await expect(page.getByRole("heading", { name: `Arsenal at home ${suffix}` })).toBeVisible();
  await expect(page.getByText(new RegExp(exactHomeAddress))).toBeVisible();
});

test("direct invitation and attendance approval reveal then revoke a protected address", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await clearMailbox();
  await seedCachedFixtureCatalogAfterFailure();

  const suffix = Date.now().toString().slice(-8);
  const password = "matchday-local-test";
  const hostHandle = `b10_host_${suffix}`;
  const inviteeHandle = `b10_invited_${suffix}`;
  const requesterHandle = `b10_request_${suffix}`;
  const eventTitle = `B10 home huddle ${suffix}`;
  const exactAddress = `77 Protected B10 Home ${suffix}, Haifa`;

  await signUpAndVerify(page, context, `b10-host-${suffix}@example.com`, password);
  await completeProfile(page, hostHandle, "B10 Host");

  const inviteeContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const inviteePage = await inviteeContext.newPage();
  const requesterContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const requesterPage = await requesterContext.newPage();

  try {
    await signUpAndVerify(
      inviteePage,
      inviteeContext,
      `b10-invited-${suffix}@example.com`,
      password,
    );
    await completeProfile(inviteePage, inviteeHandle, "B10 Invited Fan");
    await inviteePage.goto(new URL(`/people/${hostHandle}`, inviteePage.url()).toString());
    await inviteePage.getByRole("button", { name: "Add friend" }).click();
    await expect(inviteePage.getByRole("status")).toHaveText("Friend request sent.");
    await page.goto(new URL(`/people/${inviteeHandle}`, page.url()).toString());
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("status")).toHaveText("Friend request accepted.");

    await signUpAndVerify(
      requesterPage,
      requesterContext,
      `b10-requester-${suffix}@example.com`,
      password,
    );
    await completeProfile(requesterPage, requesterHandle, "B10 Requesting Fan");
    await requesterPage.goto(new URL(`/people/${hostHandle}`, requesterPage.url()).toString());
    await requesterPage.getByRole("button", { name: "Add friend" }).click();
    await expect(requesterPage.getByRole("status")).toHaveText("Friend request sent.");
    await page.goto(new URL(`/people/${requesterHandle}`, page.url()).toString());
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("status")).toHaveText("Friend request accepted.");

    await page.goto(new URL("/events/new", page.url()).toString());
    await page.getByRole("combobox", { name: "Future fixture" }).selectOption({ index: 1 });
    await page.getByRole("textbox", { name: "Event title" }).fill(eventTitle);
    await page.getByRole("combobox", { name: "City" }).selectOption({ label: "Haifa" });
    await page
      .getByRole("textbox", { name: "Description" })
      .fill("A protected home event proving direct invitations and attendance approval.");
    await page.getByRole("textbox", { name: "Exact home address" }).fill(exactAddress);
    await page.getByRole("spinbutton", { name: "Longitude" }).fill("34.99800");
    await page.getByRole("spinbutton", { name: "Latitude" }).fill("32.81200");
    await page.getByRole("radio", { name: /Friends/ }).click();
    await page.getByRole("checkbox", { name: /I confirm that I am the host/i }).click();
    await page.getByRole("button", { name: "Publish event" }).click();
    await page.getByRole("link", { name: "Open safe event summary" }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    await expect(page.getByText(new RegExp(exactAddress))).toBeVisible();
    const eventPath = new URL(page.url()).pathname;

    await page.getByRole("link", { name: "Manage invitations and attendance" }).click();
    await page.getByRole("textbox", { name: "Huddle handle" }).fill(inviteeHandle);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText(`@${inviteeHandle}`);

    await inviteePage.goto(new URL("/events", inviteePage.url()).toString());
    await expect(inviteePage.getByRole("heading", { name: eventTitle })).toBeVisible();
    await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(inviteePage.getByRole("status")).toContainText("place is confirmed");

    await requesterPage.goto(new URL(eventPath, requesterPage.url()).toString());
    await expect(requesterPage.getByRole("heading", { name: eventTitle })).toBeVisible();
    await expect(requesterPage.getByText(exactAddress)).toHaveCount(0);
    expect(await requesterPage.content()).not.toContain(exactAddress);
    await expect(requesterPage.getByRole("button", { name: "Request to attend" })).toBeVisible();
    await requesterPage.getByRole("button", { name: "Request to attend" }).click();
    await expect(requesterPage.getByRole("status")).toContainText("request was sent");

    await page.reload();
    const requesterCard = page
      .getByRole("link", { name: `B10 Requesting Fan · @${requesterHandle}` })
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(requesterCard.getByRole("button", { name: "Approve" })).toBeVisible();
    if (captureB10Evidence) {
      await page.screenshot({
        fullPage: true,
        path: "docs/evidence/b10/attendance-review-desktop.png",
      });
    }
    await requesterCard.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status")).toHaveText("Request approved.");

    await inviteePage.goto(new URL(eventPath, inviteePage.url()).toString());
    await expect(inviteePage.getByText(new RegExp(exactAddress))).toBeVisible();
    const eventId = eventPath.split("/").at(-1);
    const calendarPath = `/api/events/${eventId}/calendar.ics`;
    const authorizedCalendar = await inviteePage.evaluate(async (path) => {
      const response = await fetch(path);
      return { body: await response.text(), ok: response.ok };
    }, calendarPath);
    expect(authorizedCalendar.ok, authorizedCalendar.body).toBe(true);
    expect(authorizedCalendar.body).toContain(`LOCATION:${exactAddress.replace(",", "\\,")}`);

    if (captureB10Evidence) {
      await inviteePage.screenshot({
        fullPage: true,
        path: "docs/evidence/b10/approved-private-event-desktop.png",
      });
    }

    const inviteeCard = page
      .getByRole("link", { name: `B10 Invited Fan · @${inviteeHandle}` })
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await inviteeCard.getByRole("button", { name: "Remove attendee" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm removal" }).click();
    await expect(page.getByRole("status")).toContainText("Attendee removed");

    await inviteePage.reload();
    await expect(inviteePage.getByText(exactAddress)).toHaveCount(0);
    expect(await inviteePage.content()).not.toContain(exactAddress);
    const revokedCalendar = await inviteePage.evaluate(async (path) => {
      const response = await fetch(path);
      return { body: await response.text(), ok: response.ok };
    }, calendarPath);
    expect(revokedCalendar.ok, revokedCalendar.body).toBe(true);
    expect(revokedCalendar.body).not.toContain(exactAddress);

    await requesterPage.reload();
    await expect(requesterPage.getByText(new RegExp(exactAddress))).toBeVisible();
    await requesterPage.getByRole("button", { name: "Leave event" }).click();
    await requesterPage
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm leave" })
      .click();
    await expect(requesterPage.getByRole("status")).toContainText("history was retained");
    await expect(requesterPage.getByText(exactAddress)).toHaveCount(0);
  } finally {
    await inviteeContext.close();
    await requesterContext.close();
  }
});

test("a confidential report becomes an independently reviewed moderation appeal", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);

  const suffix = Date.now().toString().slice(-8);
  const password = "matchday-local-test";
  const reporterEmail = `b11-reporter-${suffix}@example.com`;
  const targetEmail = `b11-target-${suffix}@example.com`;
  const firstModeratorEmail = `b11-moderator-a-${suffix}@example.com`;
  const secondModeratorEmail = `b11-moderator-b-${suffix}@example.com`;
  const reporterHandle = `b11_report_${suffix}`;
  const targetHandle = `b11_target_${suffix}`;
  const targetDisplayName = `B11 Group Admin ${suffix}`;
  const confidentialDetails = `Confidential B11 evidence ${suffix} must stay inside platform moderation.`;
  const decisionReason = `A documented temporary suspension is proportionate for B11 ${suffix}.`;
  const appealReason = `Please independently review the context for B11 decision ${suffix}.`;
  const appealOutcome = `Independent review reversed the B11 suspension ${suffix}.`;

  await seedCompletedUser(reporterEmail, password, reporterHandle, "B11 Reporter");
  const targetId = await seedCompletedUser(targetEmail, password, targetHandle, targetDisplayName);
  const firstModeratorId = await seedCompletedUser(
    firstModeratorEmail,
    password,
    `b11_moda_${suffix}`,
    "B11 Moderator A",
  );
  const secondModeratorId = await seedCompletedUser(
    secondModeratorEmail,
    password,
    `b11_modb_${suffix}`,
    "B11 Moderator B",
  );
  const groupSlug = await seedGroupOwner(targetId, suffix);

  localDatabaseQuery(`
    insert into public.platform_roles (profile_id, role)
    values
      (${sqlLiteral(firstModeratorId)}::uuid, 'moderator'),
      (${sqlLiteral(secondModeratorId)}::uuid, 'moderator');
  `);

  await signIn(page, reporterEmail, password);
  await page.goto(new URL(`/people/${targetHandle}`, page.url()).toString());
  await page.getByText(`Report @${targetHandle}`, { exact: true }).click();
  await page.getByRole("combobox", { name: "What happened?" }).selectOption("other");
  await page.getByRole("textbox", { name: "Details" }).fill(confidentialDetails);
  await page.getByRole("button", { name: "Submit confidential report" }).click();
  await expect(page.getByRole("status")).toContainText("Report received");

  await page.goto(new URL("/reports", page.url()).toString());
  await expect(page.getByText(targetHandle, { exact: true })).toBeVisible();
  await expect(page.getByText("received", { exact: true })).toBeVisible();
  await expect(page.getByText(confidentialDetails)).toHaveCount(0);

  const targetContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const targetPage = await targetContext.newPage();
  const firstModeratorContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const firstModeratorPage = await firstModeratorContext.newPage();
  const secondModeratorContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const secondModeratorPage = await secondModeratorContext.newPage();

  try {
    await signIn(targetPage, targetEmail, password);
    await targetPage.goto(new URL(`/groups/${groupSlug}`, targetPage.url()).toString());
    await expect(targetPage.getByText("Your role: owner")).toBeVisible();
    await expect(targetPage.getByRole("link", { name: "Manage group" })).toBeVisible();
    await expect(targetPage.getByText(confidentialDetails)).toHaveCount(0);

    await targetPage.goto(new URL("/moderation", targetPage.url()).toString());
    await expect(targetPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await targetPage.goto(new URL("/reports", targetPage.url()).toString());
    await expect(targetPage.getByText("No reports submitted.")).toBeVisible();
    await expect(targetPage.getByText(confidentialDetails)).toHaveCount(0);
    await expect(targetPage.getByText(reporterHandle)).toHaveCount(0);

    await signIn(firstModeratorPage, firstModeratorEmail, password);
    await firstModeratorPage.goto(new URL("/moderation", firstModeratorPage.url()).toString());
    const reportCard = firstModeratorPage
      .getByRole("region", { name: "Confidential reports" })
      .locator('[data-slot="card"]')
      .filter({ hasText: targetHandle });
    await expect(reportCard).toContainText(confidentialDetails);
    await expect(reportCard).toContainText(`@${reporterHandle}`);
    await reportCard.getByRole("button", { name: "Assign to me" }).click();
    await expect(reportCard.getByLabel("Proportional action")).toBeVisible();
    await reportCard.getByLabel("Proportional action").selectOption("temporary_suspension");
    await reportCard.getByRole("textbox", { name: "Decision reason" }).fill(decisionReason);
    await reportCard.getByRole("button", { name: "Review temporary suspension" }).click();
    const destructiveConfirmation = firstModeratorPage.getByRole("alertdialog");
    await expect(destructiveConfirmation).toContainText("takes effect immediately");
    await destructiveConfirmation.getByRole("button", { name: "Cancel" }).click();
    await expect(destructiveConfirmation).toHaveCount(0);
    await expect(reportCard).toContainText("reviewing");

    await reportCard.getByRole("button", { name: "Review temporary suspension" }).click();
    await firstModeratorPage
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm temporary suspension" })
      .click();
    await expect(reportCard).toContainText("resolved");

    await targetPage.goto(new URL("/reports", targetPage.url()).toString());
    const actionCard = targetPage.locator('[data-slot="card"]').filter({ hasText: decisionReason });
    await expect(actionCard).toContainText("temporary suspension");
    await actionCard.getByText("Appeal this action", { exact: true }).click();
    await actionCard
      .getByRole("textbox", { name: "Why should this decision be reviewed?" })
      .fill(appealReason);
    await actionCard.getByRole("button", { name: "Submit appeal" }).click();
    await expect(actionCard).toContainText("Appeal under review.");

    await firstModeratorPage.reload();
    const appealedAction = firstModeratorPage
      .getByRole("region", { name: "Active enforcement actions" })
      .locator('[data-slot="card"]')
      .filter({ hasText: decisionReason });
    await expect(appealedAction).toContainText(
      "An active appeal must be decided from the appeal queue",
    );
    await expect(
      appealedAction.getByRole("button", { name: "Reverse with audit evidence" }),
    ).toHaveCount(0);
    const originalModeratorAppeal = firstModeratorPage
      .locator('[data-slot="card"]')
      .filter({ hasText: appealReason });
    await expect(originalModeratorAppeal).toContainText(
      "You made the original decision. Another active moderator must review this appeal",
    );
    await expect(
      originalModeratorAppeal.getByRole("button", { name: "Record outcome" }),
    ).toHaveCount(0);

    await signIn(secondModeratorPage, secondModeratorEmail, password);
    await secondModeratorPage.goto(new URL("/moderation", secondModeratorPage.url()).toString());
    const independentAppeal = secondModeratorPage
      .locator('[data-slot="card"]')
      .filter({ hasText: appealReason });
    await independentAppeal.getByRole("combobox", { name: "Outcome" }).selectOption("reverse");
    await independentAppeal.getByRole("textbox", { name: "Outcome reason" }).fill(appealOutcome);
    if (captureB11Evidence) {
      await secondModeratorPage.screenshot({
        fullPage: true,
        path: "docs/evidence/b11/independent-appeal-review-desktop.png",
      });
    }

    await secondModeratorPage.setViewportSize({ width: 390, height: 844 });
    const mobileMenuTrigger = secondModeratorPage.getByRole("button", {
      name: "Menu",
      exact: true,
    });
    await mobileMenuTrigger.click();
    await expect(secondModeratorPage.getByRole("menu", { name: "Menu" })).toBeVisible();
    await expect(secondModeratorPage.getByRole("menuitem", { name: "Safety" })).toBeVisible();
    await expect(secondModeratorPage.getByRole("menuitem", { name: "Moderation" })).toBeVisible();
    await secondModeratorPage.keyboard.press("Escape");
    await expect(mobileMenuTrigger).toBeFocused();
    expect(
      await secondModeratorPage.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    if (captureB11Evidence) {
      await secondModeratorPage.screenshot({
        fullPage: true,
        path: "docs/evidence/b11/independent-appeal-review-mobile.png",
      });
    }

    await secondModeratorPage.setViewportSize({ width: 1024, height: 768 });
    await expect(mobileMenuTrigger).toBeVisible();
    expect(
      await secondModeratorPage.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await secondModeratorPage.setViewportSize({ width: 1280, height: 720 });

    await independentAppeal.getByRole("button", { name: "Record outcome" }).click();
    await expect(independentAppeal).toContainText("reversed");

    await targetPage.reload();
    await expect(targetPage.getByText(`Outcome: ${appealOutcome}`, { exact: true })).toBeVisible();
    await expect(targetPage.getByText("reversed", { exact: true }).first()).toBeVisible();
  } finally {
    await targetContext.close();
    await firstModeratorContext.close();
    await secondModeratorContext.close();
  }
});
