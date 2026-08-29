import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const captureUxEvidence = process.env.HUDDLE_CAPTURE_UX_EVIDENCE === "1";
const haifaCityId = "00000000-0000-4000-8000-000000000003";

function uniqueSuffix() {
  return randomUUID().replaceAll("-", "").slice(0, 8);
}

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

async function localUserClient(email: string, password: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl === undefined || publishableKey === undefined) {
    throw new Error("The local publishable test environment is unavailable.");
  }

  const client = createSupabaseClient<Database>(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error !== null) throw error;
  return client;
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

function localDatabaseRows<T>(sql: string): T[] {
  const executable = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  const output = execFileSync(
    executable,
    ["db", "query", "--local", "--agent", "no", "--output", "json", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const rows: unknown = JSON.parse(output);
  if (!Array.isArray(rows)) {
    throw new Error("The local database query did not return a JSON row array.");
  }
  return rows as T[];
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

async function seedGroupOwner(
  ownerId: string,
  suffix: string,
  visibility: "discoverable" | "unlisted" = "unlisted",
) {
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
        ${sqlLiteral(visibility)}
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

  const fixture = localDatabaseRows<{
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    starts_at: string;
  }>(`
    select id, home_team_id, away_team_id, starts_at
    from public.matches
    where provider = 'football-data'
      and provider_external_id = 'b04-e2e-match';
  `).at(0);
  if (fixture === undefined) throw new Error("The acceptance fixture was not persisted.");

  return {
    matchId: fixture.id,
    homeTeamId: fixture.home_team_id,
    awayTeamId: fixture.away_team_id,
    startsAt: fixture.starts_at,
  };
}

function seedAcceptedFriendship(firstUserId: string, secondUserId: string) {
  const [userLowId, userHighId] = [firstUserId, secondUserId].sort();
  const respondedAt = new Date().toISOString();
  localDatabaseQuery(`
    insert into public.friendships (
      user_low_id, user_high_id, requested_by, status, responded_at
    ) values (
      ${sqlLiteral(userLowId)}::uuid,
      ${sqlLiteral(userHighId)}::uuid,
      ${sqlLiteral(firstUserId)}::uuid,
      'accepted',
      ${sqlLiteral(respondedAt)}::timestamptz
    );
  `);
}

type FixtureSeed = Awaited<ReturnType<typeof seedCachedFixtureCatalogAfterFailure>>;

function privateEventInput(
  fixture: FixtureSeed,
  title: string,
  overrides: Partial<Database["public"]["Functions"]["create_or_update_event"]["Args"]> = {},
): Database["public"]["Functions"]["create_or_update_event"]["Args"] {
  const startsAt = new Date(fixture.startsAt);
  return {
    input_event_id: null as unknown as string,
    input_host_venue_id: null as unknown as string,
    input_organizing_group_id: null as unknown as string,
    input_match_id: fixture.matchId,
    input_title: title,
    input_description: "A deterministic private acceptance event for registered Huddle users.",
    input_expected_activity: "Watch the full match together",
    input_cost_description: "Free",
    input_event_rules: "Respect the host, the home, and every attendee.",
    input_commercial_affiliation: "None",
    input_host_presence_confirmed: true,
    input_starts_at: startsAt.toISOString(),
    input_ends_at: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    input_city_id: haifaCityId,
    input_place_kind: "home",
    input_venue_id: null as unknown as string,
    input_public_place_name: null as unknown as string,
    input_public_address_text: null as unknown as string,
    input_public_longitude: null as unknown as number,
    input_public_latitude: null as unknown as number,
    input_audience: "invite_only",
    input_audience_team_id: null as unknown as string,
    input_audience_group_id: null as unknown as string,
    input_capacity: 6,
    input_requires_approval: true,
    input_private_address_text: "44 Protected Acceptance Home, Haifa",
    input_private_directions: "Use the private entrance.",
    input_private_longitude: 34.998,
    input_private_latitude: 32.812,
    input_intent: "publish",
    ...overrides,
  };
}

async function createPrivateEvent(
  email: string,
  password: string,
  fixture: FixtureSeed,
  title: string,
  overrides: Partial<Database["public"]["Functions"]["create_or_update_event"]["Args"]> = {},
) {
  const client = await localUserClient(email, password);
  const input = privateEventInput(fixture, title, overrides);
  const result = await client.rpc("create_or_update_event", input);
  if (result.error !== null) throw result.error;
  const eventId = result.data.at(0)?.event_id;
  if (eventId === undefined) throw new Error("Private event creation returned no event ID.");
  return { client, eventId, input };
}

async function createVenueEvent(
  email: string,
  password: string,
  fixture: FixtureSeed,
  suffix: string,
  overrides: Partial<Database["public"]["Functions"]["create_or_update_event"]["Args"]> = {},
) {
  const client = await localUserClient(email, password);
  const venueResult = await client.rpc("create_venue", {
    input_address_text: "12 Hanassi Boulevard, Haifa",
    input_city_id: haifaCityId,
    input_description: "A deterministic acceptance venue with accessible seating.",
    input_latitude: 32.81303,
    input_longitude: 34.99928,
    input_name: `Acceptance Venue ${suffix}`,
    input_screen_count: 4,
    input_slug: `acceptance-venue-${suffix}`,
    input_stated_capacity: 80,
  });
  if (venueResult.error !== null) throw venueResult.error;
  const venueId = venueResult.data.at(0)?.venue_id;
  if (venueId === undefined) throw new Error("Venue creation returned no venue ID.");

  const startsAt = new Date(fixture.startsAt);
  const input: Database["public"]["Functions"]["create_or_update_event"]["Args"] = {
    input_event_id: null as unknown as string,
    input_host_venue_id: venueId,
    input_organizing_group_id: null as unknown as string,
    input_match_id: fixture.matchId,
    input_title: `Acceptance venue event ${suffix}`,
    input_description: "A deterministic venue event for end-to-end acceptance coverage.",
    input_expected_activity: "Watch the full match together",
    input_cost_description: "No cover charge",
    input_event_rules: "Respect staff and every supporter.",
    input_commercial_affiliation: "Hosted by the listed venue",
    input_host_presence_confirmed: true,
    input_starts_at: startsAt.toISOString(),
    input_ends_at: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    input_city_id: haifaCityId,
    input_place_kind: "venue",
    input_venue_id: venueId,
    input_public_place_name: null as unknown as string,
    input_public_address_text: null as unknown as string,
    input_public_longitude: null as unknown as number,
    input_public_latitude: null as unknown as number,
    input_audience: "public",
    input_audience_team_id: null as unknown as string,
    input_audience_group_id: null as unknown as string,
    input_capacity: 40,
    input_requires_approval: false,
    input_private_address_text: null as unknown as string,
    input_private_directions: null as unknown as string,
    input_private_longitude: null as unknown as number,
    input_private_latitude: null as unknown as number,
    input_intent: "publish",
    ...overrides,
  };
  const eventResult = await client.rpc("create_or_update_event", input);
  if (eventResult.error !== null) throw eventResult.error;
  const eventId = eventResult.data.at(0)?.event_id;
  if (eventId === undefined) throw new Error("Venue event creation returned no event ID.");

  return { client, eventId, input, venueId, venueSlug: `acceptance-venue-${suffix}` };
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
  await expect(page.getByRole("link", { name: "Finish setup", exact: true })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
}

async function expectProfileNavigation(page: Page) {
  const accountTrigger = page.getByRole("button", { name: "Open account navigation" });
  await expect(accountTrigger).toBeVisible();
  await accountTrigger.click();
  await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
  await page.keyboard.press("Escape");
  await expect(accountTrigger).toBeFocused();
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
  await page.getByRole("combobox", { name: "City" }).selectOption("haifa");

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

test("01 signup, verification, required onboarding, and a team follow", async ({
  context,
  page,
}) => {
  await clearMailbox();
  await seedCachedFixtureCatalogAfterFailure();

  const suffix = uniqueSuffix();
  const email = `b02-${suffix}@example.com`;
  const password = "matchday-local-test";
  const handle = `fan_${suffix}`;

  await signUpAndVerify(page, context, email, password);
  await expect(page.getByRole("link", { name: "Complete your profile" })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
  await completeProfile(page, handle, "Local Fan", true);

  await expect(page.getByText("This is your public profile.")).toBeVisible();
  await expect(page.getByText(email)).not.toBeVisible();
  await page.reload();
  await expectProfileNavigation(page);

  await page.goto(new URL("/settings/interests", page.url()).toString());
  await page.getByRole("button", { name: "Follow Arsenal" }).click();
  await expect(page.getByRole("status")).toHaveText("Follow added.");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
  await expectProfileNavigation(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});

test("a block is private, directional, auditable, and reversible", async ({
  browser,
  context,
  page,
}) => {
  await clearMailbox();

  const suffix = uniqueSuffix();
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

    await page.goto(
      new URL(`/people?q=${encodeURIComponent("Target Fan")}`, page.url()).toString(),
    );
    await expect(page.getByRole("heading", { name: "Find people." })).toBeVisible();
    const targetResult = page.getByRole("link", { name: "Target Fan", exact: true });
    await expect(targetResult).toHaveAttribute("href", `/people/${secondHandle}`);
    if (captureUxEvidence) {
      await page.screenshot({
        fullPage: true,
        path: "docs/evidence/ux/people-search-desktop.png",
      });
    }
    await targetResult.click();
    await expect(page).toHaveURL(new RegExp(`/people/${secondHandle}$`));
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

test("05 and 07 a group reaches discovery and a member event receives admin approval", async ({
  browser,
  context,
  page,
}) => {
  // This integrated G06/E05/E07 journey deliberately provisions six verified accounts.
  test.setTimeout(90_000);

  await clearMailbox();
  await seedCachedFixtureCatalogAfterFailure();

  const suffix = uniqueSuffix();
  const email = `group-owner-${suffix}@example.com`;
  const password = "matchday-local-test";
  const handle = `owner_${suffix}`;
  const slug = `haifa-huddle-${suffix}`;

  await signUpAndVerify(page, context, email, password);
  await completeProfile(page, handle, "Group Owner");
  await page.goto(new URL("/groups/new", page.url()).toString());

  await page.getByRole("textbox", { name: "Group name" }).fill(`Haifa Huddle ${suffix}`);
  await page.getByRole("textbox", { name: "Group URL" }).fill(slug);
  await page.getByRole("combobox", { name: "City" }).selectOption({ label: "Haifa" });
  await page
    .getByRole("textbox", { name: /Description/ })
    .fill("A local group for respectful match-day gatherings.");
  await page.getByRole("button", { name: "Review group" }).click();

  await expect(page.getByRole("status")).toContainText(
    /No similar discoverable groups found|Review these discoverable groups/,
  );
  await expect(page.getByRole("button", { name: "Create group" })).toBeVisible();
  await page.getByRole("button", { name: "Create group" }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${slug}[?]created=1$`));
  await expect(page.getByText(/Your group is ready/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Haifa Huddle ${suffix}` })).toBeVisible();
  await expect(page.getByText("Your role: owner")).toBeVisible();
  await expect(page.getByText("Forming and accepting applications")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active members" })).toBeVisible();
  await expect(page.getByText("Group Owner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share group" })).toBeVisible();

  await page.goto(new URL("/dashboard", page.url()).toString());
  await expect(page.getByRole("heading", { name: "Everything you're part of." })).toBeVisible();
  await expect(page.getByText(`Haifa Huddle ${suffix}`, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open group" }).click();

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
    await expect(applicantPage).toHaveURL(/\/events\/[0-9a-f-]{36}\?created=1$/);
    await expect(applicantPage.getByText(/Your event is saved/i)).toBeVisible();
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

    await applicantPage.reload();
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
    const publicGroupResults = applicantPage.getByRole("region", {
      name: "Public group search results",
    });
    await expect(
      publicGroupResults.getByText(`Haifa Huddle ${suffix}`, { exact: true }),
    ).toHaveCount(0);

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
    await expect(
      applicantPage
        .getByRole("region", { name: "Public group search results" })
        .getByText(`Haifa Huddle ${suffix}`, { exact: true }),
    ).toBeVisible();

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
    await page.getByRole("combobox", { name: "City" }).selectOption({ label: "Haifa" });
    await page.getByRole("combobox", { name: "Visibility" }).selectOption("unlisted");
    await page
      .getByRole("textbox", { name: /Description/ })
      .fill("An unlisted circle with reviewed invitation applications.");
    await page.getByRole("button", { name: "Review group" }).click();
    await expect(page.getByRole("button", { name: "Create group" })).toBeVisible();
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${unlistedSlug}[?]created=1$`));
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

test("17 a provider failure preserves cached fixtures and exposes stale state", async ({
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

  const suffix = uniqueSuffix();
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

  const suffix = uniqueSuffix();
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
  await page.getByRole("combobox", { name: "City" }).selectOption({ label: "Haifa" });
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

  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText(/Your event is saved/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Arsenal at home ${suffix}` })).toBeVisible();
  await expect(page.getByText(new RegExp(exactHomeAddress))).toBeVisible();
  await expect(page.getByRole("button", { name: "Share event" })).toBeVisible();

  const privateEventPath = new URL(page.url()).pathname;
  await page.goto(new URL("/dashboard", page.url()).toString());
  await expect(page.getByRole("heading", { name: "Everything you're part of." })).toBeVisible();
  await expect(page.getByText(`Arsenal at home ${suffix}`, { exact: true })).toBeVisible();
  if (captureUxEvidence) {
    await page.screenshot({
      fullPage: true,
      path: "docs/evidence/ux/my-huddle-desktop.png",
    });
  }
  await page.goto(new URL(privateEventPath, page.url()).toString());
  await expect(page.getByText(new RegExp(exactHomeAddress))).toBeVisible();
});

test("08 and 12 approval reveals a home address and host removal revokes it", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await clearMailbox();
  const fixture = await seedCachedFixtureCatalogAfterFailure();

  const suffix = uniqueSuffix();
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
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}\?created=1$/);
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

    const hostClient = await localUserClient(`b10-host-${suffix}@example.com`, password);
    const materialChange = await hostClient.rpc("create_or_update_event", {
      ...privateEventInput(fixture, eventTitle, {
        input_audience: "friends",
        input_private_address_text: `Changed ${exactAddress}`,
      }),
      input_event_id: eventPath.split("/").at(-1) as string,
    });
    expect(materialChange.error?.message).toContain("MATERIAL_CHANGE_REQUIRES_NEW_EVENT");

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

test("16 a confidential report becomes an independently reviewed moderation appeal", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);

  const suffix = uniqueSuffix();
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

test("02 personalized discovery uses a one-shot browser coordinate without persisting it", async ({
  context,
  page,
}) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const viewerEmail = `b12-discovery-${suffix}@example.com`;
  const hostEmail = `b12-discovery-host-${suffix}@example.com`;
  const viewerId = await seedCompletedUser(
    viewerEmail,
    password,
    `b12_discovery_${suffix}`,
    "B12 Discovering Fan",
  );
  await seedCompletedUser(
    hostEmail,
    password,
    `b12_discovery_host_${suffix}`,
    "B12 Discovery Venue Host",
  );
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const event = await createVenueEvent(hostEmail, password, fixture, suffix);
  if (fixture.homeTeamId === null) throw new Error("The fixture has no home team.");
  const viewerClient = await localUserClient(viewerEmail, password);
  const followResult = await viewerClient.from("subscriptions").insert({
    user_id: viewerId,
    kind: "team",
    sport_id: null,
    competition_id: null,
    team_id: fixture.homeTeamId,
  });
  if (followResult.error !== null) throw followResult.error;

  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:3000" });
  await context.setGeolocation({ latitude: 32.81303, longitude: 34.99928 });
  await signIn(page, viewerEmail, password);
  const discoveryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/discovery?")) discoveryRequests.push(request.url());
  });
  await page.goto(new URL("/discover?city=haifa", page.url()).toString());
  await expect(page.getByText(event.input.input_title, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use my location once" }).click();
  await expect(page.getByText("Using this browser location", { exact: true })).toBeVisible();
  await expect.poll(() => discoveryRequests.length).toBeGreaterThan(0);
  expect(discoveryRequests.at(-1)).toContain("lat=32.81303");
  expect(discoveryRequests.at(-1)).toContain("lng=34.99928");
  expect(page.url()).not.toContain("lat=");
  expect(page.url()).not.toContain("lng=");
});

test("03 accepted friends see a friends-only event while an unrelated user is denied", async ({
  browser,
}) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const hostEmail = `b12-friend-host-${suffix}@example.com`;
  const friendEmail = `b12-friend-${suffix}@example.com`;
  const strangerEmail = `b12-stranger-${suffix}@example.com`;
  const hostId = await seedCompletedUser(
    hostEmail,
    password,
    `b12_friend_host_${suffix}`,
    "B12 Friend Host",
  );
  const friendId = await seedCompletedUser(
    friendEmail,
    password,
    `b12_friend_${suffix}`,
    "B12 Accepted Friend",
  );
  await seedCompletedUser(strangerEmail, password, `b12_stranger_${suffix}`, "B12 Unrelated Fan");
  seedAcceptedFriendship(hostId, friendId);
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const address = `31 Hidden Friends Home ${suffix}, Haifa`;
  const event = await createPrivateEvent(
    hostEmail,
    password,
    fixture,
    `Friends-only acceptance ${suffix}`,
    {
      input_audience: "friends",
      input_private_address_text: address,
    },
  );

  const friendContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const friendPage = await friendContext.newPage();
  const strangerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const strangerPage = await strangerContext.newPage();
  try {
    await signIn(friendPage, friendEmail, password);
    await friendPage.goto(`/events/${event.eventId}`);
    await expect(friendPage.getByRole("heading", { name: event.input.input_title })).toBeVisible();
    await expect(friendPage.getByText(address)).toHaveCount(0);
    expect(await friendPage.content()).not.toContain(address);

    await signIn(strangerPage, strangerEmail, password);
    await strangerPage.goto(`/events/${event.eventId}`);
    await expect(strangerPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await strangerPage.content()).not.toContain(address);
  } finally {
    await friendContext.close();
    await strangerContext.close();
  }
});

test("04 crafted host and audience boundary violations are rejected", async ({ page }) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const hostEmail = `b12-boundary-${suffix}@example.com`;
  const friendEmail = `b12-boundary-friend-${suffix}@example.com`;
  const hostId = await seedCompletedUser(
    hostEmail,
    password,
    `b12_boundary_${suffix}`,
    "B12 Boundary Host",
  );
  const friendId = await seedCompletedUser(
    friendEmail,
    password,
    `b12_boundary_friend_${suffix}`,
    "B12 Boundary Friend",
  );
  seedAcceptedFriendship(hostId, friendId);
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const hostClient = await localUserClient(hostEmail, password);

  const privatePublicAttempt = await hostClient.rpc(
    "create_or_update_event",
    privateEventInput(fixture, `Crafted public private-host event ${suffix}`, {
      input_audience: "public",
    }),
  );
  expect(privatePublicAttempt.error?.message).toContain("NOT_ALLOWED");

  const venueEvent = await createVenueEvent(hostEmail, password, fixture, suffix);
  const venuePrivateAttempt = await hostClient.rpc("create_or_update_event", {
    ...venueEvent.input,
    input_event_id: null as unknown as string,
    input_title: `Crafted friends venue event ${suffix}`,
    input_audience: "friends",
  });
  expect(venuePrivateAttempt.error?.message).toContain("NOT_ALLOWED");

  await signIn(page, hostEmail, password);
  await page.goto(new URL("/events/new", page.url()).toString());
  await expect(page.getByRole("radio", { name: /Public/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Team followers/ })).toHaveCount(0);
  await page.goto(new URL(`/events/new?venue=${venueEvent.venueSlug}`, page.url()).toString());
  await expect(page.getByRole("radio", { name: /Friends/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Invite only/ })).toHaveCount(0);
});

test("06 a group ban removes membership and denies a fresh application", async ({
  browser,
  page,
}) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const ownerEmail = `b12-ban-owner-${suffix}@example.com`;
  const applicantEmail = `b12-ban-applicant-${suffix}@example.com`;
  const ownerId = await seedCompletedUser(
    ownerEmail,
    password,
    `b12_ban_owner_${suffix}`,
    "B12 Ban Owner",
  );
  await seedCompletedUser(
    applicantEmail,
    password,
    `b12_ban_applicant_${suffix}`,
    "B12 Banned Applicant",
  );
  const groupSlug = await seedGroupOwner(ownerId, `ban-${suffix}`, "discoverable");
  const group = localDatabaseRows<{ id: string }>(`
    select id from public.groups where slug = ${sqlLiteral(groupSlug)};
  `).at(0);
  if (group === undefined) throw new Error("The acceptance group was not persisted.");

  const applicantContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const applicantPage = await applicantContext.newPage();
  try {
    await signIn(page, ownerEmail, password);
    await signIn(applicantPage, applicantEmail, password);
    await applicantPage.goto(`/groups/${groupSlug}`);
    await applicantPage
      .getByRole("textbox", { name: /Note to the administrators/ })
      .fill("Please review this deterministic B12 application.");
    await applicantPage.getByRole("button", { name: "Apply to join" }).click();
    await expect(applicantPage.getByText("Application: pending")).toBeVisible();

    await page.goto(`/groups/${groupSlug}/manage?section=applications`);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("heading", { name: "No pending applications." })).toBeVisible();
    await page.goto(`/groups/${groupSlug}/manage?section=members`);
    const applicantCard = page
      .getByRole("link", { name: "B12 Banned Applicant" })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await applicantCard.getByRole("button", { name: "Ban" }).click();
    await page.getByRole("textbox", { name: "Internal reason" }).fill("Safety boundary test");
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm ban" }).click();
    await expect(page.getByRole("link", { name: "B12 Banned Applicant" })).toHaveCount(0);

    await applicantPage.reload();
    await expect(applicantPage.getByRole("heading", { name: "Apply to join" })).toHaveCount(0);
    const applicantClient = await localUserClient(applicantEmail, password);
    const reapplication = await applicantClient.rpc("apply_to_group", {
      input_group_id: group.id,
      input_message: "A banned member must not be able to reapply.",
    });
    expect(reapplication.error?.message).toContain("GROUP_BANNED");
  } finally {
    await applicantContext.close();
  }
});

test("09 home capacity, no-plus-one, and one-account-one-seat rules hold", async ({ page }) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const hostEmail = `b12-cap-host-${suffix}@example.com`;
  const attendeeEmail = `b12-cap-attendee-${suffix}@example.com`;
  await seedCompletedUser(hostEmail, password, `b12_cap_host_${suffix}`, "B12 Capacity Host");
  const attendeeId = await seedCompletedUser(
    attendeeEmail,
    password,
    `b12_cap_attendee_${suffix}`,
    "B12 Capacity Attendee",
  );
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const hostClient = await localUserClient(hostEmail, password);
  const overCapacity = await hostClient.rpc(
    "create_or_update_event",
    privateEventInput(fixture, `Over-capacity home ${suffix}`, { input_capacity: 13 }),
  );
  expect(overCapacity.error?.message).toContain("VALIDATION_FAILED");

  const venueEvent = await createVenueEvent(hostEmail, password, fixture, `seat-${suffix}`, {
    input_capacity: 2,
  });
  const attendeeClient = await localUserClient(attendeeEmail, password);
  const firstJoin = await attendeeClient.rpc("request_or_join_event", {
    input_event_id: venueEvent.eventId,
  });
  const secondJoin = await attendeeClient.rpc("request_or_join_event", {
    input_event_id: venueEvent.eventId,
  });
  expect(firstJoin.error).toBeNull();
  expect(secondJoin.error?.message).toContain("ALREADY_ATTENDING");
  const attendanceRows = localDatabaseRows<{ id: string }>(`
    select id
    from public.event_attendance
    where event_id = ${sqlLiteral(venueEvent.eventId)}::uuid
      and user_id = ${sqlLiteral(attendeeId)}::uuid;
  `);
  expect(attendanceRows).toHaveLength(1);

  await signIn(page, hostEmail, password);
  await page.goto(new URL("/events/new", page.url()).toString());
  await expect(page.getByRole("spinbutton", { name: "Maximum people" })).toHaveAttribute(
    "max",
    "12",
  );
  await expect(page.getByText(/Everyone needs their own Huddle account\./)).toBeVisible();
  await expect(page.locator('input[name*="guest" i], input[name*="plus" i]')).toHaveCount(0);
});

test("10 venue follow and team-follow eligibility allow a direct-invitation override", async ({
  browser,
}) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const ownerEmail = `b12-team-owner-${suffix}@example.com`;
  const followerEmail = `b12-team-follower-${suffix}@example.com`;
  const inviteeEmail = `b12-team-invitee-${suffix}@example.com`;
  await seedCompletedUser(ownerEmail, password, `b12_team_owner_${suffix}`, "B12 Team Venue Owner");
  const followerId = await seedCompletedUser(
    followerEmail,
    password,
    `b12_team_follower_${suffix}`,
    "B12 Team Follower",
  );
  const inviteeHandle = `b12_team_invitee_${suffix}`;
  await seedCompletedUser(inviteeEmail, password, inviteeHandle, "B12 Direct Invitee");
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  if (fixture.homeTeamId === null) throw new Error("The fixture has no home team.");
  const event = await createVenueEvent(ownerEmail, password, fixture, `team-${suffix}`, {
    input_audience: "team_followers",
    input_audience_team_id: fixture.homeTeamId,
    input_requires_approval: false,
  });
  const followerClient = await localUserClient(followerEmail, password);
  const subscription = await followerClient.from("subscriptions").insert({
    user_id: followerId,
    kind: "team",
    sport_id: null,
    competition_id: null,
    team_id: fixture.homeTeamId,
  });
  if (subscription.error !== null) throw subscription.error;

  const followerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const followerPage = await followerContext.newPage();
  const inviteeContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const inviteePage = await inviteeContext.newPage();
  try {
    await signIn(followerPage, followerEmail, password);
    await followerPage.goto(`/venues/${event.venueSlug}`);
    await followerPage.getByRole("button", { name: /Follow Acceptance Venue/ }).click();
    await expect(followerPage.getByRole("status")).toHaveText("Venue followed.");
    await followerPage.goto(`/events/${event.eventId}`);
    await followerPage.getByRole("button", { name: "Join event" }).click();
    await expect(followerPage.getByRole("status")).toContainText("place is confirmed");

    await signIn(inviteePage, inviteeEmail, password);
    await inviteePage.goto(`/events/${event.eventId}`);
    await inviteePage.getByRole("button", { name: "Join event" }).click();
    await expect(
      inviteePage.getByRole("alert").filter({ hasText: "You cannot perform that action." }),
    ).toBeVisible();

    const ownerClient = await localUserClient(ownerEmail, password);
    const invitation = await ownerClient.rpc("create_event_invitation", {
      input_event_id: event.eventId,
      input_invitee_handle: inviteeHandle,
    });
    if (invitation.error !== null) throw invitation.error;
    await inviteePage.reload();
    await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(inviteePage.getByRole("status")).toContainText("place is confirmed");
  } finally {
    await followerContext.close();
    await inviteeContext.close();
  }
});

test("11 simultaneous joins reserve only the available venue seat", async ({ page }) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const ownerEmail = `b12-race-owner-${suffix}@example.com`;
  const firstEmail = `b12-race-a-${suffix}@example.com`;
  const secondEmail = `b12-race-b-${suffix}@example.com`;
  await seedCompletedUser(ownerEmail, password, `b12_race_owner_${suffix}`, "B12 Race Venue Owner");
  await seedCompletedUser(firstEmail, password, `b12_race_a_${suffix}`, "B12 Race Fan A");
  await seedCompletedUser(secondEmail, password, `b12_race_b_${suffix}`, "B12 Race Fan B");
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const event = await createVenueEvent(ownerEmail, password, fixture, `race-${suffix}`, {
    input_capacity: 1,
  });
  const [firstClient, secondClient] = await Promise.all([
    localUserClient(firstEmail, password),
    localUserClient(secondEmail, password),
  ]);
  const results = await Promise.all([
    firstClient.rpc("request_or_join_event", { input_event_id: event.eventId }),
    secondClient.rpc("request_or_join_event", { input_event_id: event.eventId }),
  ]);
  expect(results.filter((result) => result.error === null)).toHaveLength(1);
  expect(results.filter((result) => result.error?.message.includes("EVENT_FULL"))).toHaveLength(1);
  const approved = localDatabaseRows<{ id: string }>(`
    select id
    from public.event_attendance
    where event_id = ${sqlLiteral(event.eventId)}::uuid
      and status = 'approved';
  `);
  expect(approved).toHaveLength(1);

  const rejectedEmail = results[0]?.error === null ? secondEmail : firstEmail;
  await signIn(page, rejectedEmail, password);
  await page.goto(new URL(`/events/${event.eventId}`, page.url()).toString());
  await expect(page.getByRole("button", { name: "Event full" })).toBeDisabled();
});

test("13 blocking a future home-event participant revokes friendship attendance and address", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const hostEmail = `b12-block-host-${suffix}@example.com`;
  const attendeeEmail = `b12-block-attendee-${suffix}@example.com`;
  const hostHandle = `b12_block_host_${suffix}`;
  const attendeeHandle = `b12_block_attendee_${suffix}`;
  const hostId = await seedCompletedUser(hostEmail, password, hostHandle, "B12 Blocked Host");
  const attendeeId = await seedCompletedUser(
    attendeeEmail,
    password,
    attendeeHandle,
    "B12 Blocking Attendee",
  );
  seedAcceptedFriendship(hostId, attendeeId);
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const address = `52 Revoked Block Home ${suffix}, Haifa`;
  const event = await createPrivateEvent(
    hostEmail,
    password,
    fixture,
    `Block revocation event ${suffix}`,
    { input_audience: "friends", input_private_address_text: address },
  );
  const attendeeClient = await localUserClient(attendeeEmail, password);
  const request = await attendeeClient.rpc("request_or_join_event", {
    input_event_id: event.eventId,
  });
  if (request.error !== null) throw request.error;
  const attendanceId = request.data.at(0)?.attendance_id;
  if (attendanceId === undefined) throw new Error("Attendance request returned no ID.");
  const approval = await event.client.rpc("review_attendance", {
    input_attendance_id: attendanceId,
    input_decision: "approve",
  });
  if (approval.error !== null) throw approval.error;

  await signIn(page, attendeeEmail, password);
  await page.goto(new URL(`/events/${event.eventId}`, page.url()).toString());
  await expect(page.getByText(new RegExp(address))).toBeVisible();
  await page.goto(new URL(`/people/${hostHandle}`, page.url()).toString());
  await page.getByRole("button", { name: `Block @${hostHandle}` }).click();
  await page.getByRole("button", { name: "Confirm block" }).click();
  await expect(page.getByRole("status")).toHaveText("Safety preference updated.");
  await page.goto(new URL(`/events/${event.eventId}`, page.url()).toString());
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(await page.content()).not.toContain(address);

  const [userLowId, userHighId] = [hostId, attendeeId].sort();
  const attendance = localDatabaseRows<{ status: string }>(`
    select status
    from public.event_attendance
    where id = ${sqlLiteral(attendanceId)}::uuid;
  `).at(0);
  const friendshipRows = localDatabaseRows<{ id: string }>(`
    select id
    from public.friendships
    where user_low_id = ${sqlLiteral(userLowId!)}::uuid
      and user_high_id = ${sqlLiteral(userHighId!)}::uuid;
  `);
  expect(attendance?.status).toBe("left");
  expect(friendshipRows).toHaveLength(0);
});

test("14 crafted cross-user event group and venue edits are denied", async () => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const eventOwnerEmail = `b12-edit-event-${suffix}@example.com`;
  const groupOwnerEmail = `b12-edit-group-${suffix}@example.com`;
  const venueOwnerEmail = `b12-edit-venue-${suffix}@example.com`;
  const attackerEmail = `b12-edit-attacker-${suffix}@example.com`;
  await seedCompletedUser(eventOwnerEmail, password, `b12_edit_event_${suffix}`, "B12 Event Owner");
  const groupOwnerId = await seedCompletedUser(
    groupOwnerEmail,
    password,
    `b12_edit_group_${suffix}`,
    "B12 Group Owner",
  );
  await seedCompletedUser(venueOwnerEmail, password, `b12_edit_venue_${suffix}`, "B12 Venue Owner");
  await seedCompletedUser(
    attackerEmail,
    password,
    `b12_edit_attacker_${suffix}`,
    "B12 Crafted Attacker",
  );
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const event = await createPrivateEvent(
    eventOwnerEmail,
    password,
    fixture,
    `Protected owner event ${suffix}`,
  );
  const groupSlug = await seedGroupOwner(groupOwnerId, `edit-${suffix}`, "discoverable");
  const venue = await createVenueEvent(venueOwnerEmail, password, fixture, `edit-${suffix}`);
  const group = localDatabaseRows<{ id: string }>(`
    select id from public.groups where slug = ${sqlLiteral(groupSlug)};
  `).at(0);
  if (group === undefined) throw new Error("The protected group was not persisted.");
  const attacker = await localUserClient(attackerEmail, password);

  const [eventEdit, groupEdit, venueEdit] = await Promise.all([
    attacker.rpc("create_or_update_event", {
      ...event.input,
      input_event_id: event.eventId,
      input_title: "Crafted cross-user event edit",
    }),
    attacker.rpc("update_group_description", {
      input_group_id: group.id,
      input_description: "A crafted cross-user group edit that must be rejected.",
    }),
    attacker.rpc("update_venue", {
      input_venue_id: venue.venueId,
      input_address_text: "99 Crafted Address, Haifa",
      input_city_id: haifaCityId,
      input_description: "A crafted cross-user venue edit that must be rejected.",
      input_latitude: 32.81303,
      input_longitude: 34.99928,
      input_name: "Crafted Venue Edit",
      input_screen_count: 2,
      input_slug: venue.venueSlug,
      input_stated_capacity: 30,
    }),
  ]);
  expect(eventEdit.error?.message).toContain("NOT_ALLOWED");
  expect(groupEdit.error?.message).toContain("NOT_ALLOWED");
  expect(venueEdit.error?.message).toContain("NOT_ALLOWED");
});

test("15 calendar location appears only while private attendance remains authorized", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const password = "matchday-local-test";
  const hostEmail = `b12-calendar-host-${suffix}@example.com`;
  const attendeeEmail = `b12-calendar-attendee-${suffix}@example.com`;
  const attendeeHandle = `b12_calendar_attendee_${suffix}`;
  await seedCompletedUser(hostEmail, password, `b12_calendar_host_${suffix}`, "B12 Calendar Host");
  await seedCompletedUser(attendeeEmail, password, attendeeHandle, "B12 Calendar Attendee");
  const fixture = await seedCachedFixtureCatalogAfterFailure();
  const address = `63 Calendar Protected Home ${suffix}, Haifa`;
  const event = await createPrivateEvent(
    hostEmail,
    password,
    fixture,
    `Calendar authorization ${suffix}`,
    { input_private_address_text: address },
  );
  const invitation = await event.client.rpc("create_event_invitation", {
    input_event_id: event.eventId,
    input_invitee_handle: attendeeHandle,
  });
  if (invitation.error !== null) throw invitation.error;
  const invitationId = invitation.data.at(0)?.invitation_id;
  if (invitationId === undefined) throw new Error("Invitation returned no ID.");
  const attendeeClient = await localUserClient(attendeeEmail, password);
  const acceptance = await attendeeClient.rpc("respond_to_event_invitation", {
    input_invitation_id: invitationId,
    input_decision: "accept",
  });
  if (acceptance.error !== null) throw acceptance.error;

  await signIn(page, attendeeEmail, password);
  await page.goto(new URL(`/events/${event.eventId}`, page.url()).toString());
  const calendarPath = `/api/events/${event.eventId}/calendar.ics`;
  const beforeCancellation = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return { body: await response.text(), status: response.status };
  }, calendarPath);
  expect(beforeCancellation.status).toBe(200);
  expect(beforeCancellation.body).toContain("BEGIN:VCALENDAR");
  expect(beforeCancellation.body).toContain("BEGIN:VEVENT");
  expect(beforeCancellation.body).toContain(`LOCATION:${address.replace(",", "\\,")}`);

  const cancellation = await event.client.rpc("cancel_event", {
    input_event_id: event.eventId,
    input_reason: "B12 calendar revocation acceptance",
  });
  if (cancellation.error !== null) throw cancellation.error;
  const afterCancellation = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return { body: await response.text(), status: response.status };
  }, calendarPath);
  expect(afterCancellation.status).toBe(404);
  expect(afterCancellation.body).not.toContain(address);
});
