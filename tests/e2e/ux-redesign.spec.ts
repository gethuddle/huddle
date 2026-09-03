import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import path from "node:path";

import type { Database } from "@/types/database.generated";

type MailpitAddress = Readonly<{ Address?: string; Email?: string }>;
type MailpitMessageSummary = Readonly<{
  ID: string;
  To?: readonly MailpitAddress[];
}>;
type MailpitMessages = Readonly<{ messages?: readonly MailpitMessageSummary[] }>;
type MailpitMessage = Readonly<{ HTML?: string }>;

type JourneyProject = Readonly<{
  key: "desktop" | "tablet" | "mobile";
  label: "Desktop" | "Tablet" | "Mobile";
  width: 1280 | 768 | 375;
}>;

const mailpitUrl = process.env.HUDDLE_MAILPIT_URL ?? "http://127.0.0.1:54324";
const password = "matchday-local-test";

function journeyProject(testInfo: TestInfo): JourneyProject {
  if (testInfo.project.name === "ux-desktop-1280") {
    return { key: "desktop", label: "Desktop", width: 1280 };
  }
  if (testInfo.project.name === "ux-tablet-768") {
    return { key: "tablet", label: "Tablet", width: 768 };
  }
  if (testInfo.project.name === "ux-mobile-375") {
    return { key: "mobile", label: "Mobile", width: 375 };
  }
  throw new Error(`Unexpected Task 14 project: ${testInfo.project.name}`);
}

function journeyIdentity(project: JourneyProject) {
  // Keep the tracked journey deterministic across focused and complete-suite
  // runs. The viewport project is already a unique serial namespace, while a
  // worker-derived suffix changes after an earlier test failure and would make
  // the next cleanup miss residue from the previous run.
  const runKey = project.key;
  return {
    runKey,
    ownerEmail: `ux14-${runKey}-owner@example.com`,
    ownerHandle: `ux14_${project.key}_owner`,
    ownerName: "Álvaro אבי",
    participantEmail: `ux14-${runKey}-participant@example.com`,
    participantHandle: `ux14_${project.key}_member`,
    participantName: "Jose\u0301 Daniel דניאל",
    groupName: `UX14 ${project.label} Circle`,
    eventTitle: `UX14 ${project.label} Fan Huddle`,
    venueName: `UX14 ${project.label} Match House`,
    venueSlug: `ux14-${project.key}-venue`,
    publishedVenueTitles: [
      `UX14 ${project.label} Venue Night One`,
      `UX14 ${project.label} Venue Night Two`,
    ],
    draftVenueTitles: [
      `UX14 ${project.label} Venue Draft One`,
      `UX14 ${project.label} Venue Draft Two`,
    ],
  } as const;
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

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function addIsoDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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
  if (!Array.isArray(rows)) throw new Error("The local database query returned no row array.");
  return rows as T[];
}

function cleanupJourney(runKey?: string) {
  const emailPrefix = runKey === undefined ? "ux14-%" : `ux14-${runKey}-%`;
  const providerPrefix = runKey === undefined ? "ux14-%" : `ux14-${runKey}-%`;
  localDatabaseQuery(`
    do $cleanup$
    declare
      journey_users uuid[];
      journey_events uuid[];
    begin
      select coalesce(array_agg(id), array[]::uuid[])
      into journey_users
      from auth.users
      where email like ${sqlLiteral(emailPrefix)};

      select coalesce(array_agg(event.id), array[]::uuid[])
      into journey_events
      from public.events as event
      where event.created_by = any(journey_users)
         or event.host_user_id = any(journey_users)
         or event.host_venue_id in (
           select venue.id from public.venues as venue where venue.owner_id = any(journey_users)
         );

      delete from public.event_invitations where event_id = any(journey_events);
      delete from public.event_attendance where event_id = any(journey_events);
      delete from public.events where id = any(journey_events);
      delete from public.groups where owner_id = any(journey_users);
      delete from public.venues where owner_id = any(journey_users);
      delete from auth.users where id = any(journey_users);
      delete from public.matches
      where provider = 'football-data'
        and provider_external_id like ${sqlLiteral(providerPrefix)};
      delete from public.competition_teams
      where team_id in (
        select id from public.teams
        where provider = 'football-data'
          and provider_external_id like ${sqlLiteral(providerPrefix)}
      );
      delete from public.teams
      where provider = 'football-data'
        and provider_external_id like ${sqlLiteral(providerPrefix)};
    end
    $cleanup$;
  `);
}

function journeyResidue(runKey: string) {
  return localDatabaseRows<{
    account_count: number;
    match_count: number;
    team_count: number;
    venue_count: number;
  }>(`
    select
      (
        select count(*)::integer
        from auth.users
        where email like ${sqlLiteral(`ux14-${runKey}-%`)}
      ) as account_count,
      (
        select count(*)::integer
        from public.matches
        where provider = 'football-data'
          and provider_external_id like ${sqlLiteral(`ux14-${runKey}-%`)}
      ) as match_count,
      (
        select count(*)::integer
        from public.teams
        where provider = 'football-data'
          and provider_external_id like ${sqlLiteral(`ux14-${runKey}-%`)}
      ) as team_count,
      (
        select count(*)::integer
        from public.venues
        where slug like ${sqlLiteral(`ux14-${runKey}-%`)}
      ) as venue_count;
  `).at(0);
}

async function seedFixtureCatalog(runKey: string) {
  const admin = localAdminClient();
  const now = new Date();
  const firstKickoff = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const secondKickoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirdKickoff = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);
  const fourthKickoff = new Date(now.getTime() + 11 * 24 * 60 * 60 * 1000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const run = await admin.rpc("begin_sports_sync", {
    input_provider: "football-data",
    input_window_start: date(now),
    input_window_end: date(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)),
    input_trigger_source: "manual",
  });
  if (run.error !== null) throw run.error;

  const homeExternalId = `ux14-${runKey}-home`;
  const awayExternalId = `ux14-${runKey}-away`;
  const secondAwayExternalId = `ux14-${runKey}-away-two`;
  const thirdAwayExternalId = `ux14-${runKey}-away-three`;
  const fourthAwayExternalId = `ux14-${runKey}-away-four`;
  const firstExternalId = `ux14-${runKey}-match-one`;
  const secondExternalId = `ux14-${runKey}-match-two`;
  const thirdExternalId = `ux14-${runKey}-match-three`;
  const fourthExternalId = `ux14-${runKey}-match-four`;
  const completed = await admin.rpc("complete_sports_sync", {
    input_run_id: run.data,
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
        provider_external_id: homeExternalId,
        name: "North Stand FC",
        short_name: "North Stand",
        tla: "NSF",
        crest_url: "https://crests.football-data.org/57.png",
        country_name: "England",
      },
      {
        provider_external_id: awayExternalId,
        name: "South Bank FC",
        short_name: "South Bank",
        tla: "SBF",
        country_name: "England",
      },
      {
        provider_external_id: secondAwayExternalId,
        name: "Riverside FC",
        short_name: "Riverside",
        tla: "RSF",
        country_name: "England",
      },
      {
        provider_external_id: thirdAwayExternalId,
        name: "Harbour United",
        short_name: "Harbour",
        tla: "HBU",
        country_name: "England",
      },
      {
        provider_external_id: fourthAwayExternalId,
        name: "Carmel Athletic",
        short_name: "Carmel",
        tla: "CMA",
        country_name: "England",
      },
    ],
    input_competition_teams: [
      homeExternalId,
      awayExternalId,
      secondAwayExternalId,
      thirdAwayExternalId,
      fourthAwayExternalId,
    ].map((teamExternalId) => ({
      competition_external_id: "2021",
      team_external_id: teamExternalId,
      season_label: "2026",
    })),
    input_matches: [
      {
        provider_external_id: firstExternalId,
        competition_external_id: "2021",
        home_team_external_id: homeExternalId,
        away_team_external_id: awayExternalId,
        starts_at: firstKickoff.toISOString(),
        status: "timed",
        matchday: 1,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
      {
        provider_external_id: secondExternalId,
        competition_external_id: "2021",
        home_team_external_id: homeExternalId,
        away_team_external_id: secondAwayExternalId,
        starts_at: secondKickoff.toISOString(),
        status: "timed",
        matchday: 2,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
      {
        provider_external_id: thirdExternalId,
        competition_external_id: "2021",
        home_team_external_id: homeExternalId,
        away_team_external_id: thirdAwayExternalId,
        starts_at: thirdKickoff.toISOString(),
        status: "timed",
        matchday: 3,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
      {
        provider_external_id: fourthExternalId,
        competition_external_id: "2021",
        home_team_external_id: homeExternalId,
        away_team_external_id: fourthAwayExternalId,
        starts_at: fourthKickoff.toISOString(),
        status: "timed",
        matchday: 4,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
    ],
    input_request_count: 1,
    input_retry_count: 0,
  });
  if (completed.error !== null) throw completed.error;

  const fixtures = localDatabaseRows<{ id: string; label: string }>(`
    select match.id,
           home.short_name || ' vs ' || away.short_name || ' — ' || competition.name as label
    from public.matches as match
    join public.teams as home on home.id = match.home_team_id
    join public.teams as away on away.id = match.away_team_id
    join public.competitions as competition on competition.id = match.competition_id
    where match.provider = 'football-data'
      and match.provider_external_id in (
        ${sqlLiteral(firstExternalId)},
        ${sqlLiteral(secondExternalId)},
        ${sqlLiteral(thirdExternalId)},
        ${sqlLiteral(fourthExternalId)}
      )
    order by match.starts_at;
  `);
  if (fixtures.length !== 4) throw new Error("Task 14 fixtures were not seeded.");
  const homeTeam = localDatabaseRows<{ id: string }>(`
    select id
    from public.teams
    where provider = 'football-data'
      and provider_external_id = ${sqlLiteral(homeExternalId)};
  `).at(0);
  if (homeTeam === undefined) throw new Error("Task 14 home team was not seeded.");
  return { fixtures, homeTeamId: homeTeam.id } as const;
}

async function mailpitJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(pathname, mailpitUrl), init);
  if (!response.ok) throw new Error(`Local Mailpit failed with ${response.status}.`);
  return (await response.json()) as T;
}

async function clearMailbox() {
  const response = await fetch(new URL("/api/v1/messages", mailpitUrl), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Unable to clear Mailpit (${response.status}).`);
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
      if (encodedHref === undefined) throw new Error("Verification email had no link.");
      return new URL(encodedHref.replaceAll("&amp;", "&"));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Verification email did not arrive.");
}

async function signUpAndVerify(page: Page, email: string, accountPassword: string) {
  await page.goto("/auth/sign-up");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(accountPassword);
  await page.getByLabel("Confirm password").fill(accountPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("a verification link is on its way");

  const confirmationUrl = await verificationUrlFor(email);
  expect(confirmationUrl.pathname).toBe("/auth/verify/confirm");
  expect(new URLSearchParams(confirmationUrl.hash.slice(1)).has("token_hash")).toBe(true);
  const passiveResponse = await fetch(new URL(confirmationUrl.pathname, confirmationUrl.origin), {
    redirect: "manual",
  });
  expect(passiveResponse.status).toBe(200);
  await page.goto(confirmationUrl.toString());
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL("http://localhost:3000/onboarding");
  await expect(page.getByRole("heading", { name: "How will you use Huddle?" })).toBeVisible();
}

async function completeFan(page: Page, handle: string, displayName: string) {
  await page.getByRole("link", { name: "Set up Fan", exact: true }).click();
  await expectNoCityControl(page);
  await page.getByRole("textbox", { name: "Display name" }).fill(displayName);
  await page.getByRole("textbox", { name: "Handle" }).fill(handle);
  await page.getByRole("checkbox", { name: /18 or older/i }).click();
  await page.getByRole("checkbox", { name: /accept the current/i }).click();
  await page.getByRole("button", { name: "Start using Huddle" }).click();
  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
}

async function expectNoCityControl(page: Page) {
  await expect(page.getByRole("combobox", { name: /city/i })).toHaveCount(0);
  await expect(
    page.locator(
      'input[name="city" i], input[name="cityId" i], input[name="citySlug" i], input[name="city_id" i], select[name="city" i], select[name="cityId" i], select[name="citySlug" i], select[name="city_id" i]',
    ),
  ).toHaveCount(0);
}

function recordBrowserFailures(page: Page) {
  const errors: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

function journeyUrl(page: Page, pathname: string) {
  return new URL(pathname, page.url()).toString();
}

async function confirmPrivateHomeAddress(page: Page, address: string, id: string) {
  const routePattern = "**/api/locations/search";
  const routeHandler = async (route: Route) => {
    expect(route.request().postDataJSON()).toEqual({
      purpose: "private_home",
      query: address,
    });
    await route.fulfill({
      body: JSON.stringify({
        suggestions: [
          {
            id,
            label: address,
            latitude: 32.812,
            longitude: 34.998,
          },
        ],
      }),
      contentType: "application/json",
      status: 200,
    });
  };
  await page.route(routePattern, routeHandler);
  await page.getByRole("combobox", { name: "Home address" }).fill(address);
  await page.getByRole("option", { name: address }).click();
  await page.unroute(routePattern, routeHandler);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectFanNavigation(page: Page, width: number, currentLabel: string) {
  const navigation = page.getByRole("navigation", {
    name: width < 1024 ? "Fan mobile navigation" : "Fan navigation",
  });
  await expect(navigation.getByRole("link")).toHaveText([
    "Home",
    "Explore",
    width < 1024 ? "Ask" : "Ask Huddle",
    "My Huddle",
    "People",
  ]);
  if (currentLabel === "Account") {
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(0);
    await page.getByRole("banner").getByRole("button", { name: "Switch workspace" }).click();
    await expect(page.getByRole("menuitem", { name: "Account settings" })).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(navigation.getByRole("link", { name: currentLabel, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  const boxes = await navigation.getByRole("link").evaluateAll((links) =>
    links.map((link) => {
      const box = link.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  if (width < 1024) {
    const anchor = await navigation.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        bottomGap: window.innerHeight - box.bottom,
        position: getComputedStyle(element).position,
      };
    });
    expect(anchor.position).toBe("fixed");
    expect(Math.abs(anchor.bottomGap)).toBeLessThanOrEqual(1);
  }
}

async function expectVenueNavigation(page: Page, width: number, currentLabel: string) {
  const navigation = page.getByRole("navigation", {
    name: width < 1024 ? "Venue mobile navigation" : "Venue navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveText(["Today", "Calendar", "Events", "Venue"]);
  if (currentLabel === "Account") {
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(0);
    await page.getByRole("banner").getByRole("button", { name: "Switch workspace" }).click();
    await expect(page.getByRole("menuitem", { name: "Account settings" })).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(navigation.getByRole("link", { name: currentLabel, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  const boxes = await navigation.getByRole("link").evaluateAll((links) =>
    links.map((link) => {
      const box = link.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  if (width < 1024) {
    const anchor = await navigation.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        bottomGap: window.innerHeight - box.bottom,
        position: getComputedStyle(element).position,
      };
    });
    expect(anchor.position).toBe("fixed");
    expect(Math.abs(anchor.bottomGap)).toBeLessThanOrEqual(1);
  }
}

async function searchPeople(page: Page, query: string) {
  await page.goto(journeyUrl(page, "/people"));
  await page.getByRole("textbox", { name: "Name or Huddle handle" }).fill(query);
  await page.getByRole("button", { name: "Search people" }).click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]q=${encodeURIComponent(query).replaceAll("%20", "\\+")}`),
  );
  return page.getByRole("region", { name: "Search results" });
}

async function selectJourneyFixture(page: Page) {
  const fixtureSearch = page.getByRole("searchbox", { name: "Search fixtures" });
  await fixtureSearch.fill("North Stand");
  const fixture = page.getByRole("button", { name: /North Stand.*South Bank/ }).first();
  await expect(fixture).toBeVisible();
  await fixture.click();
  await expect(fixture).toHaveAttribute("aria-pressed", "true");
}

async function addVenueFixture(page: Page, query: string) {
  const fixtureSearch = page.getByRole("searchbox", { name: "Search fixtures" });
  await fixtureSearch.fill(query);
  const fixture = page.getByRole("button", { name: new RegExp(query, "i") }).first();
  await expect(fixture).toBeVisible();
  await fixture.click();
  await expect(
    page.getByRole("button", { name: new RegExp(`Remove .*${query}`, "i") }),
  ).toBeVisible();
}

async function planVenueBatch(
  page: Page,
  venueSlug: string,
  fixtureQueries: readonly [string, string],
  titles: readonly [string, string],
  intent: "draft" | "publish",
  attendanceModes: readonly ["open_door" | "reservations", "open_door" | "reservations"] = [
    "reservations",
    "reservations",
  ],
) {
  await page.goto(journeyUrl(page, `/venues/${venueSlug}/workspace/plan`));
  await addVenueFixture(page, fixtureQueries[0]);
  await addVenueFixture(page, fixtureQueries[1]);
  const areas = page.getByRole("combobox", { name: /Viewing area for/ });
  await expect(areas).toHaveCount(2);
  await areas.nth(0).selectOption({ label: "Main screen · 80 places" });
  await areas.nth(1).selectOption({ label: "Balcony screen · 36 places" });
  await page.getByRole("button", { name: "Review events" }).click();
  await expect(page.getByRole("heading", { name: "Review inherited details" })).toBeVisible();
  const attendance = page.getByRole("combobox", { name: "Attendance" });
  await expect(attendance).toHaveCount(2);
  await attendance.nth(0).selectOption(attendanceModes[0]);
  await attendance.nth(1).selectOption(attendanceModes[1]);
  await expect(
    page.getByText("Doors open 45 minutes before kickoff.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: /registered accounts · Staff approval required$/ }),
  ).toHaveCount(attendanceModes.filter((mode) => mode === "reservations").length);
  await expect(
    page.locator("p").filter({
      hasText: "Open door — no RSVP, invitations, approval queue, or capacity claim.",
    }),
  ).toHaveCount(attendanceModes.filter((mode) => mode === "open_door").length);
  const titleFields = page.getByRole("textbox", { name: "Custom title (optional)" });
  const descriptionFields = page.getByRole("textbox", {
    name: "Custom description (optional)",
  });
  await titleFields.nth(0).fill(titles[0]);
  await titleFields.nth(1).fill(titles[1]);
  await descriptionFields
    .nth(0)
    .fill("A deterministic public Venue event proving inherited match-day defaults.");
  await descriptionFields
    .nth(1)
    .fill("A second deterministic Venue event proving one atomic multi-fixture batch.");
  await page
    .getByRole("button", { name: intent === "publish" ? "Publish batch" : "Save batch as drafts" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    intent === "publish" ? "2 events published." : "2 events saved as drafts.",
  );
  await page.getByRole("link", { name: "Open calendar" }).click();
}

test("complete deterministic Fan and Venue workspace journey", async ({
  browser,
  context,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const project = journeyProject(testInfo);
  const identity = journeyIdentity(project);
  const viewport = testInfo.project.use.viewport;
  if (viewport === null || viewport === undefined) throw new Error("Task 14 needs a viewport.");

  cleanupJourney();
  await clearMailbox();
  const fixtureCatalog = await seedFixtureCatalog(identity.runKey);
  const focusedDiscoveryPath = `/discover?team=${fixtureCatalog.homeTeamId}`;
  page.setDefaultTimeout(15_000);
  const ownerErrors = recordBrowserFailures(page);
  const participantContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    geolocation: { latitude: 32.81303, longitude: 34.99928 },
    permissions: ["geolocation"],
    viewport,
  });
  const participantPage = await participantContext.newPage();
  participantPage.setDefaultTimeout(15_000);
  const participantErrors = recordBrowserFailures(participantPage);

  try {
    await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:3000" });
    await context.setGeolocation({ latitude: 32.81303, longitude: 34.99928 });
    await signUpAndVerify(page, identity.ownerEmail, password);
    await completeFan(page, identity.ownerHandle, identity.ownerName);
    await signUpAndVerify(participantPage, identity.participantEmail, password);
    await completeFan(participantPage, identity.participantHandle, identity.participantName);

    await page.goto(journeyUrl(page, "/"));
    await expect(
      page.getByRole("heading", { name: "Ready for your next match day?" }),
    ).toBeVisible();
    await expectFanNavigation(page, project.width, "Home");
    await expect(
      page.getByRole("heading", { name: "Your events, groups and saved places." }),
    ).toHaveCount(0);
    await page.goto(journeyUrl(page, "/dashboard"));
    await expect(
      page.getByRole("heading", { name: "Your events, groups and saved places." }),
    ).toBeVisible();
    await expectFanNavigation(page, project.width, "My Huddle");
    await expect(page.getByRole("heading", { name: "Ready for your next match day?" })).toHaveCount(
      0,
    );

    await page.goto(journeyUrl(page, "/settings/interests?q=North+Stand"));
    await expect(page.getByRole("searchbox", { name: "Search interests" })).toHaveValue(
      "North Stand",
    );
    await page.getByRole("button", { name: "Follow North Stand" }).click();
    await expect(page.getByRole("button", { name: "Unfollow North Stand" })).toBeVisible();
    await expect(page.getByRole("img", { name: "North Stand FC" }).first()).toHaveAttribute(
      "src",
      expect.stringContaining("crests.football-data.org/57.png"),
    );

    await page.goto(journeyUrl(page, "/discover"));
    await expect(page.getByRole("heading", { name: "Explore watch events" })).toBeVisible();
    await expectFanNavigation(page, project.width, "Explore");
    await expect(page.getByRole("button", { name: "Change Explore search" })).toBeVisible();
    await expectNoCityControl(page);

    await context.clearPermissions();
    await page.evaluate(() => window.sessionStorage.removeItem("huddle:discovery-origin"));
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Location was unavailable or declined");
    const originQuery = `Dizengoff Square ${project.label}`;
    const originLabel = `${originQuery}, Tel Aviv-Yafo, Israel`;
    const originRoute = async (route: Route) => {
      expect(route.request().postDataJSON()).toEqual({ query: originQuery, purpose: "origin" });
      await route.fulfill({
        body: JSON.stringify({
          suggestions: [
            {
              id: `ux14-${identity.runKey}-origin`,
              label: originLabel,
              latitude: 32.077,
              longitude: 34.774,
            },
          ],
        }),
        contentType: "application/json",
        status: 200,
      });
    };
    await page.route("**/api/locations/search", originRoute);
    await page.getByText("Search an area or address", { exact: true }).click();
    await page.getByRole("combobox", { name: "Area or address" }).fill(originQuery);
    await page.getByRole("option", { name: originLabel }).click();
    await expect(page.getByText(`Near ${originLabel}`)).toBeVisible();
    expect(new URL(page.url()).searchParams.has("lat")).toBe(false);
    expect(new URL(page.url()).searchParams.has("lng")).toBe(false);
    expect(new URL(page.url()).searchParams.has("city")).toBe(false);
    await page.unroute("**/api/locations/search", originRoute);

    await page.getByRole("button", { name: "Change Explore search" }).click();
    const fromField = page.getByLabel("From", { exact: true });
    const fromValue = await fromField.inputValue();
    await page.getByLabel("To", { exact: true }).fill(addIsoDays(fromValue, 60));
    await page.getByRole("button", { name: "Show events" }).click();
    await expect(page).toHaveURL(new RegExp(`to=${addIsoDays(fromValue, 60)}`));
    await expect(page.getByRole("heading", { name: "Check your search dates" })).toHaveCount(0);
    await expectNoCityControl(page);
    await context.grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByText("Using this browser location")).toBeVisible();

    const latinResults = await searchPeople(page, "José");
    await expect(latinResults.getByRole("link", { name: identity.participantName })).toBeVisible();
    const hebrewResults = await searchPeople(page, "דניאל");
    await expect(hebrewResults.getByRole("link", { name: identity.participantName })).toBeVisible();
    await hebrewResults.getByRole("button", { name: "Add friend" }).click();
    await expect(hebrewResults.getByRole("status")).toHaveText("Friend request sent.");

    await participantPage.goto(journeyUrl(participantPage, `/people/${identity.ownerHandle}`));
    await participantPage.getByRole("button", { name: "Accept" }).click();
    await expect(participantPage.getByRole("status")).toHaveText("Friend request accepted.");

    await page.goto(journeyUrl(page, "/groups/new"));
    await expectNoCityControl(page);
    await page.getByRole("textbox", { name: "Group name" }).fill(identity.groupName);
    await page
      .getByRole("textbox", { name: "Short description" })
      .fill("A global supporter circle for the complete Task 14 journey.");
    await page.getByRole("button", { name: "Review group" }).click();
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page).toHaveURL(/\/groups\/[a-z0-9-]+\?created=1$/);
    const groupPath = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: identity.groupName })).toBeVisible();
    const shareTrigger = page.getByRole("button", { name: "Share group" });
    await shareTrigger.click();
    const shareDialog = page.getByRole("dialog");
    await expect(shareDialog).toContainText("Invite one person directly");
    await shareDialog
      .getByRole("searchbox", { name: "Find a Huddle member" })
      .fill(identity.participantHandle);
    await shareDialog.getByRole("radio", { name: new RegExp(identity.participantName) }).click();
    await shareDialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(shareDialog.getByRole("status")).toContainText(
      "Invitation sent. They’ll see it in Home and My Huddle.",
    );
    await shareDialog.getByRole("button", { name: "Close" }).click();
    await expect(shareTrigger).toBeFocused();

    await participantPage.goto(journeyUrl(participantPage, "/dashboard"));
    const groupInvitations = participantPage.getByRole("region", {
      name: "Groups waiting for you",
    });
    await expect(groupInvitations.getByText(identity.groupName, { exact: true })).toBeVisible();
    await groupInvitations.getByRole("button", { name: "Join group" }).click();
    await expect(groupInvitations).toHaveCount(0);
    await expect(
      participantPage
        .getByRole("region", { name: "Your groups" })
        .getByRole("heading", { name: identity.groupName }),
    ).toBeVisible();
    await participantPage.goto(journeyUrl(participantPage, groupPath));
    await expect(participantPage.getByText("Your role: member")).toBeVisible();

    await page.goto(journeyUrl(page, `${groupPath}/manage`));
    const memberRow = page
      .getByRole("link", { name: identity.participantName })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await memberRow.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expect(memberRow).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Direct invitations" }).getByText(/accepted/),
    ).toBeVisible();

    await participantPage.goto(journeyUrl(participantPage, groupPath));
    await participantPage
      .getByRole("textbox", { name: /Note to the administrators/ })
      .fill("I want to rejoin this global supporter circle from Ashdod.");
    await participantPage.getByRole("button", { name: "Apply to join" }).click();
    await expect(participantPage.getByText("Application: pending")).toBeVisible();
    await participantPage.goto(journeyUrl(participantPage, "/dashboard?groupBucket=applying"));
    await expect(participantPage.getByText(identity.groupName, { exact: true })).toBeVisible();

    await page.goto(journeyUrl(page, "/"));
    await expect(page.getByRole("link", { name: "Review group application" })).toBeVisible();
    await page.goto(journeyUrl(page, groupPath));
    const applications = page.getByRole("region", { name: "Applications to review" });
    await expect(applications.getByRole("link", { name: identity.participantName })).toBeVisible();
    await applications.getByRole("button", { name: "Approve" }).click();
    await expect(applications).toHaveCount(0);
    await participantPage.goto(journeyUrl(participantPage, groupPath));
    await expect(participantPage.getByText("Your role: member")).toBeVisible();

    await page.goto(journeyUrl(page, "/events/new"));
    await expectNoCityControl(page);
    await selectJourneyFixture(page);
    await page.getByRole("button", { name: "Next: place and audience" }).click();
    await expectNoCityControl(page);
    await page.getByRole("textbox", { name: "Event title" }).fill(identity.eventTitle);
    await page
      .getByRole("textbox", { name: "Description" })
      .fill("A deterministic private huddle whose server-side draft survives reload.");
    const privateAddress = `44 UX14 ${project.label} Home, Haifa`;
    await confirmPrivateHomeAddress(page, privateAddress, `ux14-${identity.runKey}-private-home`);
    await expect(
      page.getByRole("region", { name: "Map for choosing a meeting point" }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /I will be present/i }).click();
    await page.getByRole("button", { name: "Next: review and publish" }).click();
    await expect(page).toHaveURL(/\/events\/new\?draft=[0-9a-f-]{36}$/);
    const draftUrl = page.url();
    await expect(page.getByText(identity.eventTitle, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(draftUrl);
    await expect(page.getByText(identity.eventTitle, { exact: true })).toBeVisible();
    await expect(page.getByText("Protected home address confirmed")).toBeVisible();
    await page.getByRole("button", { name: "Publish event" }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}\?created=1$/);
    const eventPath = new URL(page.url()).pathname;
    await expect(page.getByText("You're hosting")).toBeVisible();
    await expect(page.getByText(privateAddress)).toBeVisible();

    await page.getByRole("link", { name: "Manage event" }).click();
    const inviteTrigger = page.getByRole("button", { name: "Invite people" });
    await inviteTrigger.click();
    await page.getByRole("searchbox", { name: "Search eligible people" }).fill("דניאל");
    await page
      .getByRole("checkbox", { name: `${identity.participantName} @${identity.participantHandle}` })
      .click();
    await page.getByRole("button", { name: "Invite 1 person" }).click();
    await expect(page.getByRole("status")).toContainText("1 invitation sent.");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(inviteTrigger).toBeFocused();

    await participantPage.goto(journeyUrl(participantPage, "/"));
    await expect(participantPage.getByRole("link", { name: "Review invitation" })).toBeVisible();
    await participantPage.goto(journeyUrl(participantPage, "/events"));
    await expect(participantPage.getByRole("heading", { name: identity.eventTitle })).toBeVisible();
    await participantPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(participantPage.getByRole("status")).toContainText("place is confirmed");
    await participantPage.goto(journeyUrl(participantPage, eventPath));
    await expect(participantPage.getByText(privateAddress)).toBeVisible();

    await page.reload();
    const participantCard = page
      .getByRole("link", { name: `${identity.participantName} · @${identity.participantHandle}` })
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await participantCard.getByRole("button", { name: "Remove attendee" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm removal" }).click();
    await expect(page.getByRole("status")).toContainText("Attendee removed");
    await expect(participantCard.getByRole("button", { name: "Remove attendee" })).toHaveCount(0);

    await participantPage.reload();
    await expect(participantPage.getByText(privateAddress)).toHaveCount(0);
    expect(await participantPage.content()).not.toContain(privateAddress);
    await participantPage.goto(journeyUrl(participantPage, "/dashboard"));
    await expect(participantPage.getByText(identity.eventTitle, { exact: true })).toHaveCount(0);
    await participantPage.goto(journeyUrl(participantPage, "/dashboard?eventBucket=history"));
    await expect(participantPage.getByRole("heading", { name: "Event history" })).toBeVisible();
    await expect(participantPage.getByText(identity.eventTitle, { exact: true })).toHaveCount(0);
    await participantPage.goto(journeyUrl(participantPage, focusedDiscoveryPath));
    await expect(participantPage.getByText(identity.eventTitle, { exact: true })).toHaveCount(0);

    const venueAddressQuery = `12 UX14 ${project.label} Boulevard`;
    const venueAddress = `${venueAddressQuery}, Haifa, Israel`;
    const addressRequests: unknown[] = [];
    let addressAttempt = 0;
    let releaseAddressResponse: (() => void) | undefined;
    const addressResponseGate = new Promise<void>((resolve) => {
      releaseAddressResponse = resolve;
    });
    await page.route("**/api/locations/search", async (route) => {
      addressAttempt += 1;
      addressRequests.push(route.request().postDataJSON());
      if (addressAttempt === 1) {
        await route.fulfill({
          body: JSON.stringify({ suggestions: "invalid-mocked-shape" }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }
      await addressResponseGate;
      await route.fulfill({
        body: JSON.stringify({
          suggestions: [
            {
              id: `ux14-${identity.runKey}-address`,
              label: venueAddress,
              latitude: 32.81303,
              longitude: 34.99928,
            },
          ],
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto(journeyUrl(page, "/account"));
    await expectFanNavigation(page, project.width, "Account");
    await page.getByRole("link", { name: "Set up a venue" }).click();
    await expect(page).toHaveURL(/\/onboarding\/venue$/);
    await expect(
      page.getByRole("heading", { name: "Give your business its own workspace." }),
    ).toBeVisible();
    await expectNoCityControl(page);
    await page.getByRole("textbox", { name: "Venue name" }).fill(identity.venueName);
    await page.getByRole("textbox", { name: "Venue URL" }).fill(identity.venueSlug);
    await expect(page.locator('input[name="longitude"], input[name="latitude"]')).toHaveCount(0);
    await page.getByRole("combobox", { name: "Public address" }).fill(venueAddressQuery);
    await expect(
      page.getByRole("alert").filter({ hasText: "Address search is temporarily unavailable." }),
    ).toContainText("Address search is temporarily unavailable. Wait a moment and try again.");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => addressAttempt).toBe(2);
    if (releaseAddressResponse === undefined) {
      throw new Error("The deterministic address response gate was not initialized.");
    }
    releaseAddressResponse();
    await page.getByRole("option", { name: venueAddress }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Confirmed public address" }),
    ).toContainText(venueAddress);
    await page
      .getByRole("textbox", { name: "Public description" })
      .fill("A deterministic commercial workspace for the complete Task 14 journey.");
    await page.getByRole("spinbutton", { name: "Capacity" }).fill("80");
    await page.getByRole("checkbox", { name: "Wheelchair accessible" }).click();
    await page
      .getByRole("textbox", { name: "House information (optional)" })
      .fill("Initial deterministic match-day information.");
    await page.getByRole("checkbox", { name: /authorized to manage its Huddle listing/i }).click();
    await page.getByRole("button", { name: "Create venue account" }).click();

    await expect(page).toHaveURL(new RegExp(`/venues/${identity.venueSlug}/workspace$`));
    await expect(page.getByRole("button", { name: "Switch workspace" })).toContainText(
      identity.venueName,
    );
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(
      page.getByLabel("Self-listed venue · business identity not checked by Huddle"),
    ).toBeVisible();
    await expectVenueNavigation(page, project.width, "Today");
    await expect(page.getByRole("heading", { name: "Nothing is planned yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Huddle home" })).toHaveAttribute(
      "href",
      `/venues/${identity.venueSlug}/workspace`,
    );
    expect(addressRequests).toEqual([
      { query: venueAddressQuery, purpose: "public_address" },
      { query: venueAddressQuery, purpose: "public_address" },
    ]);
    await page.unroute("**/api/locations/search");

    await page.goto(journeyUrl(page, `/venues/${identity.venueSlug}/workspace/settings`));
    await expectNoCityControl(page);
    await expectVenueNavigation(page, project.width, "Venue");
    await expect(
      page.getByLabel("Self-listed venue · business identity not checked by Huddle"),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Venue name" })).toHaveValue(identity.venueName);
    await expect(
      page.getByRole("region", { name: "Public address" }).getByText(venueAddress, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "House information" })
      .fill("Doors open 45 minutes before kickoff.");
    await page
      .getByRole("checkbox", {
        name: "Review attendance requests by default for newly planned events.",
      })
      .click();
    await page.getByRole("button", { name: "Save venue" }).click();
    await expect(page.getByRole("status")).toHaveText("Venue profile and defaults updated.");

    const addAreaButton = page.getByRole("button", { name: "Add viewing area" });
    const addAreaForm = addAreaButton.locator("xpath=ancestor::form[1]");
    await addAreaForm.getByRole("textbox", { name: "Area name" }).fill("Balcony screen");
    await addAreaForm.getByRole("spinbutton", { name: "Capacity" }).fill("36");
    await addAreaButton.click();
    await expect(addAreaForm.getByRole("status")).toHaveText("Venue area saved.");
    await page.reload();
    await expectVenueNavigation(page, project.width, "Venue");
    await expect(page.getByRole("textbox", { name: "House information" })).toHaveValue(
      "Doors open 45 minutes before kickoff.",
    );
    await expect(
      page.getByRole("checkbox", {
        name: "Review attendance requests by default for newly planned events.",
      }),
    ).toBeChecked();
    expect(
      await page
        .getByRole("textbox", { name: "Area name" })
        .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value)),
    ).toEqual(["Main screen", "Balcony screen", ""]);

    await planVenueBatch(
      page,
      identity.venueSlug,
      ["South Bank", "Riverside"],
      identity.publishedVenueTitles,
      "publish",
      ["open_door", "reservations"],
    );
    await expectVenueNavigation(page, project.width, "Calendar");
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    const agendaTab = page.getByRole("tab", { name: "Agenda" });
    const monthTab = page.getByRole("tab", { name: "Month" });
    await expect(agendaTab).toHaveAttribute("aria-selected", "true");
    await monthTab.click();
    await expect(monthTab).toHaveAttribute("aria-selected", "true");
    await agendaTab.click();
    await expect(agendaTab).toHaveAttribute("aria-selected", "true");
    for (const title of identity.publishedVenueTitles) {
      await expect(page.getByRole("link", { name: title })).toBeVisible();
    }
    await page
      .getByRole("navigation", {
        name: project.width < 1024 ? "Venue mobile navigation" : "Venue navigation",
      })
      .getByRole("link", { name: "Events", exact: true })
      .click();
    await expectVenueNavigation(page, project.width, "Events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
    for (const title of identity.publishedVenueTitles) {
      await expect(page.getByRole("link", { name: title })).toBeVisible();
    }
    const publishedEventPath = await page
      .getByRole("link", { name: identity.publishedVenueTitles[0] })
      .getAttribute("href");
    expect(publishedEventPath).toMatch(/^\/events\/[0-9a-f-]{36}$/);

    await participantPage.goto(journeyUrl(participantPage, `/venues/${identity.venueSlug}`));
    await expect(participantPage.getByRole("heading", { name: identity.venueName })).toBeVisible();
    await expect(
      participantPage.getByLabel("Self-listed venue · business identity not checked by Huddle"),
    ).toBeVisible();
    await participantPage.getByRole("link", { name: identity.publishedVenueTitles[0] }).click();
    await expect(
      participantPage.getByRole("heading", { name: identity.publishedVenueTitles[0] }),
    ).toBeVisible();
    await expect(
      participantPage.getByText("Open door · just come along", { exact: true }),
    ).toBeVisible();
    await expect(
      participantPage.getByRole("heading", { name: "No reservation needed" }),
    ).toBeVisible();
    await expect(participantPage.getByRole("button", { name: /join|request|invite/i })).toHaveCount(
      0,
    );
    await participantPage.goBack();
    await expect(
      participantPage.getByRole("link", { name: identity.publishedVenueTitles[0] }),
    ).toBeVisible();
    await participantPage.goto(journeyUrl(participantPage, focusedDiscoveryPath));
    for (const title of identity.publishedVenueTitles) {
      await expect(participantPage.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(
      participantPage.getByRole("img", { name: "North Stand FC" }).first(),
    ).toHaveAttribute("src", expect.stringContaining("crests.football-data.org/57.png"));
    await expect(participantPage.getByRole("img", { name: "South Bank FC" }).first()).toHaveText(
      "SBF",
    );

    await page.goto(journeyUrl(page, `/venues/${identity.venueSlug}/workspace`));
    await expectVenueNavigation(page, project.width, "Today");
    await expect(
      page.getByRole("heading", { name: identity.publishedVenueTitles[0] }),
    ).toBeVisible();
    await expect(page.getByText("Open door · no guest list")).toBeVisible();

    await page.goto(journeyUrl(page, `${publishedEventPath}/manage`));
    await expect(page.getByRole("heading", { name: "Open-door event" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite people" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Attendance queue" })).toHaveCount(0);

    await planVenueBatch(
      page,
      identity.venueSlug,
      ["Harbour", "Carmel"],
      identity.draftVenueTitles,
      "draft",
    );
    await expectVenueNavigation(page, project.width, "Calendar");
    for (const title of identity.draftVenueTitles) {
      await expect(page.getByRole("link", { name: title })).toBeVisible();
    }
    const draftEventPath = await page
      .getByRole("link", { name: identity.draftVenueTitles[0] })
      .getAttribute("href");
    expect(draftEventPath).toMatch(/^\/events\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Draft" }).click();
    await expect(page.getByRole("link", { name: identity.draftVenueTitles[0] })).toBeVisible();
    await expect(page.getByRole("link", { name: identity.publishedVenueTitles[0] })).toHaveCount(0);
    await page.getByRole("button", { name: "Draft" }).click();

    await participantPage.goto(journeyUrl(participantPage, draftEventPath!));
    await expect(
      participantPage.getByRole("heading", { name: "This page isn’t available." }),
    ).toBeVisible();

    await page.goto(journeyUrl(page, "/account"));
    await expectVenueNavigation(page, project.width, "Account");
    const workspaceTrigger = page
      .getByRole("main")
      .getByRole("button", { name: "Switch workspace" });
    await workspaceTrigger.click();
    const workspaceMenu = page.getByRole("menu", { name: "Switch workspace" });
    await expect(workspaceMenu.getByText(identity.venueName, { exact: true })).toBeVisible();
    await workspaceMenu.getByRole("menuitem", { name: new RegExp(identity.ownerName) }).click();
    await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
    await expectFanNavigation(page, project.width, "Home");
    await page.goto(journeyUrl(page, focusedDiscoveryPath));
    for (const title of identity.publishedVenueTitles) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }

    await page.goto(journeyUrl(page, "/account"));
    await expectFanNavigation(page, project.width, "Account");
    await workspaceTrigger.click();
    await expect(workspaceMenu.getByText(identity.ownerName, { exact: true })).toBeVisible();
    await expect(workspaceMenu.getByText(identity.venueName, { exact: true })).toBeVisible();
    if (process.env.UPDATE_UX_EVIDENCE === "1") {
      await page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        path: path.join(
          process.cwd(),
          "docs",
          "evidence",
          "ux-redesign",
          `${project.key === "desktop" ? "desktop-1280" : project.key === "tablet" ? "tablet-768" : "mobile-375"}.png`,
        ),
      });
    }
    await page.keyboard.press("Escape");
    await expect(workspaceTrigger).toBeFocused();

    await page.goto(journeyUrl(page, "/events/00000000-0000-4000-8000-000000000000"));
    await expect(page.getByRole("heading", { name: "This page isn’t available." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open My Huddle" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    await expectNoHorizontalOverflow(page);
    await expectNoHorizontalOverflow(participantPage);
    expect(ownerErrors).toEqual([]);
    expect(participantErrors).toEqual([]);
  } finally {
    await participantContext.close();
    cleanupJourney(identity.runKey);
    await clearMailbox();
    expect(journeyResidue(identity.runKey)).toEqual({
      account_count: 0,
      match_count: 0,
      team_count: 0,
      venue_count: 0,
    });
  }
});
