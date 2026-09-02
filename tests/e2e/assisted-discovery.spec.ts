import { expect, test, type Page } from "@playwright/test";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import type { Database } from "@/types/database.generated";

const password = "matchday-local-test";

type FanSeed = Readonly<{
  client: SupabaseClient<Database>;
  email: string;
  handle: string;
  id: string;
}>;

type FixtureSeed = Readonly<{
  matchId: string;
  startsAt: string;
}>;

type VenueLocation = Readonly<{
  address: string;
  latitude: number;
  longitude: number;
}>;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 10);
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

async function localUserClient(email: string) {
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

function cancelPriorAssistedDiscoveryEvents() {
  localDatabaseQuery(`
    update public.events
    set status = 'cancelled',
        cancelled_at = statement_timestamp(),
        cancel_reason = 'Playwright fixture superseded',
        updated_at = statement_timestamp()
    where status <> 'cancelled'
      and (
        title like 'Food venue huddle %'
        or title like 'Friend Arsenal Chelsea huddle %'
        or title like 'Group UCL huddle %'
        or title like 'Jerusalem weekday huddle %'
        or title like 'Jerusalem weekday decoy %'
        or title = 'Match night at The Corner'
        or title = 'Arsenal vs Chelsea with friends'
        or title = 'Champions League supporters watch'
        or title = 'Jerusalem midweek watch'
        or title = 'Jerusalem date decoy'
      );
  `);
}

async function seedFan(run: string, role: string): Promise<FanSeed> {
  const email = `assisted-${run}-${role}@example.com`;
  const roleKey = createHash("sha256").update(role).digest("hex").slice(0, 6);
  const handle = `ai_${run}_${roleKey}`;
  const admin = localAdminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error !== null) throw created.error;
  const client = await localUserClient(email);
  const displayNames: Record<string, string> = {
    viewer: "Alex Morgan",
    friend: "Daniel Cohen",
    "group-owner": "Maya Levi",
    "venue-owner": "The Corner Team",
    "jerusalem-viewer": "Noa Ben-David",
    "jerusalem-venue-owner": "Jerusalem Host",
    "jerusalem-decoy-owner": "Jerusalem Decoy Host",
  };
  const activated = await client.rpc("activate_fan_workspace", {
    input_adult_attested: true,
    input_bio: "",
    input_display_name: displayNames[role] ?? `Assisted ${role}`,
    input_handle: handle,
    input_rules_version: 1,
  });
  if (activated.error !== null) throw activated.error;
  return { client, email, handle, id: created.data.user.id };
}

function israelDate(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date: string, amount: number): string {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function weekendDate(today: string): string {
  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  if (weekday === 5 || weekday === 6) return addDays(today, 1);
  if (weekday === 0) return today;
  return addDays(today, (5 - weekday + 7) % 7);
}

function nextWeekDate(today: string): string {
  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const daysUntilSunday = weekday === 0 ? 7 : 7 - weekday;
  return addDays(today, daysUntilSunday + 1);
}

function nextWeekdayDate(today: string, targetWeekday: number): string {
  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const delta = (targetWeekday - weekday + 7) % 7 || 7;
  return addDays(today, delta);
}

function nextMonthSearch(today: string) {
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const monthName = new Intl.DateTimeFormat("en", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  const monthShort = new Intl.DateTimeFormat("en", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    interpretation: `1–${finalDay} ${monthShort}`,
    query: `Anything in Jerusalem in ${monthName} ${year}?`,
  };
}

function kickoff(date: string): string {
  if (date === israelDate()) {
    return new Date(Date.now() + 30 * 60_000).toISOString();
  }
  return `${date}T18:00:00.000Z`;
}

async function seedFixtures(run: string, catalogClient: SupabaseClient<Database>) {
  const admin = localAdminClient();
  const today = israelDate();
  const dates = {
    tomorrow: addDays(today, 1),
    nextWeek: nextWeekDate(today),
    nextWednesday: nextWeekdayDate(today, 3),
    weekend: weekendDate(today),
  };
  const matchExternalIds = {
    tomorrow: `assisted-${run}-tomorrow`,
    nextWeek: `assisted-${run}-next-week`,
    nextWednesday: `assisted-${run}-next-wednesday`,
    weekend: `assisted-${run}-weekend`,
  };
  const started = await admin.rpc("begin_sports_sync", {
    input_provider: "football-data",
    input_window_start: today,
    input_window_end: addDays(dates.nextWeek, 7),
    input_trigger_source: "manual",
  });
  if (started.error !== null) throw started.error;
  const completed = await admin.rpc("complete_sports_sync", {
    input_run_id: started.data,
    input_sport_slug: "football",
    input_competitions: [
      {
        provider_external_id: "2021",
        code: "PL",
        name: "Premier League",
        country_name: "England",
      },
      {
        provider_external_id: "2001",
        code: "CL",
        name: "UEFA Champions League",
        country_name: "Europe",
      },
    ],
    input_teams: [
      {
        provider_external_id: "57",
        name: "Arsenal FC",
        short_name: "Arsenal",
        tla: "ARS",
        crest_url: "https://crests.football-data.org/57.png",
        country_name: "England",
      },
      {
        provider_external_id: "61",
        name: "Chelsea FC",
        short_name: "Chelsea",
        tla: "CHE",
        crest_url: "https://crests.football-data.org/61.png",
        country_name: "England",
      },
    ],
    input_competition_teams: [
      ["2021", "57"],
      ["2021", "61"],
      ["2001", "57"],
      ["2001", "61"],
    ].map(([competitionExternalId, teamExternalId]) => ({
      competition_external_id: competitionExternalId,
      team_external_id: teamExternalId,
      season_label: "2026",
    })),
    input_matches: [
      {
        provider_external_id: matchExternalIds.tomorrow,
        competition_external_id: "2021",
        home_team_external_id: "57",
        away_team_external_id: "61",
        starts_at: kickoff(dates.tomorrow),
        status: "timed",
        matchday: 1,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
      {
        provider_external_id: matchExternalIds.nextWeek,
        competition_external_id: "2021",
        home_team_external_id: "57",
        away_team_external_id: "61",
        starts_at: kickoff(dates.nextWeek),
        status: "timed",
        matchday: 2,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
      {
        provider_external_id: matchExternalIds.weekend,
        competition_external_id: "2001",
        home_team_external_id: "57",
        away_team_external_id: "61",
        starts_at: kickoff(dates.weekend),
        status: "timed",
        matchday: 3,
        stage: "LEAGUE_STAGE",
        season_label: "2026",
      },
      {
        provider_external_id: matchExternalIds.nextWednesday,
        competition_external_id: "2021",
        home_team_external_id: "57",
        away_team_external_id: "61",
        starts_at: kickoff(dates.nextWednesday),
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

  const matches = await catalogClient
    .from("matches")
    .select("id, provider_external_id, starts_at")
    .in("provider_external_id", Object.values(matchExternalIds));
  if (matches.error !== null) throw matches.error;
  const byExternalId = new Map(
    matches.data.map((match) => [
      match.provider_external_id,
      { matchId: match.id, startsAt: match.starts_at },
    ]),
  );
  const required = (key: keyof typeof matchExternalIds): FixtureSeed => {
    const fixture = byExternalId.get(matchExternalIds[key]);
    if (fixture === undefined) throw new Error(`Missing assisted-discovery ${key} fixture.`);
    return fixture;
  };
  return {
    tomorrow: required("tomorrow"),
    nextWeek: required("nextWeek"),
    nextWednesday: required("nextWednesday"),
    weekend: required("weekend"),
  };
}

function eventInput(
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
    input_description: "A deterministic event for assisted-discovery browser coverage.",
    input_expected_activity: "Watch the full match together",
    input_cost_description: "Free",
    input_event_rules: "Respect the host and every attendee.",
    input_commercial_affiliation: "None",
    input_host_presence_confirmed: true,
    input_starts_at: startsAt.toISOString(),
    input_ends_at: new Date(startsAt.getTime() + 3 * 3_600_000).toISOString(),
    input_place_kind: "public_place",
    input_venue_id: null as unknown as string,
    input_public_place_name: "The Green Room",
    input_public_address_text: "1 Browser Test Street, Haifa",
    input_public_longitude: 35,
    input_public_latitude: 32.8,
    input_audience: "friends",
    input_audience_team_id: null as unknown as string,
    input_audience_group_id: null as unknown as string,
    input_capacity: 20,
    input_requires_approval: true,
    input_private_address_text: null as unknown as string,
    input_private_directions: null as unknown as string,
    input_private_longitude: null as unknown as number,
    input_private_latitude: null as unknown as number,
    input_intent: "publish",
    ...overrides,
  };
}

async function createVenueEvent(
  owner: FanSeed,
  fixture: FixtureSeed,
  run: string,
  title: string,
  location: VenueLocation = {
    address: `12 Assisted ${run} Street, Haifa`,
    latitude: 32.8,
    longitude: 35,
  },
) {
  const venue = await owner.client.rpc("create_venue_workspace_v2", {
    input_address_text: location.address,
    input_adult_attested: true,
    input_default_attendance_mode: "reservations",
    input_default_requires_approval: false,
    input_description: "A local browser-test venue with self-reported food.",
    input_facilities: ["food", "drinks"],
    input_house_information: "Use the main entrance.",
    input_latitude: location.latitude,
    input_longitude: location.longitude,
    input_main_space_capacity: 80,
    input_main_space_name: "Main screen",
    input_name: "The Corner",
    input_representation_attested: true,
    input_rules_version: 1,
    input_slug: `assisted-venue-${run}`,
  });
  if (venue.error !== null) throw venue.error;
  const venueId = venue.data.at(0)?.venue_id;
  if (venueId === undefined) throw new Error("Venue creation returned no ID.");
  const created = await owner.client.rpc(
    "create_or_update_event",
    eventInput(fixture, title, {
      input_host_venue_id: venueId,
      input_place_kind: "venue",
      input_venue_id: venueId,
      input_public_place_name: null as unknown as string,
      input_public_address_text: null as unknown as string,
      input_public_longitude: null as unknown as number,
      input_public_latitude: null as unknown as number,
      input_audience: "public",
      input_capacity: 40,
      input_requires_approval: false,
    }),
  );
  if (created.error !== null) throw created.error;
}

async function createFriendEvent(
  viewer: FanSeed,
  friend: FanSeed,
  fixture: FixtureSeed,
  title: string,
) {
  const requested = await viewer.client.rpc("request_friendship_by_handle", {
    target_handle: friend.handle,
  });
  if (requested.error !== null) throw requested.error;
  const accepted = await friend.client.rpc("respond_to_friendship", {
    input_friendship_id: requested.data,
    input_decision: "accept",
  });
  if (accepted.error !== null) throw accepted.error;
  const created = await friend.client.rpc("create_or_update_event", eventInput(fixture, title));
  if (created.error !== null) throw created.error;
}

async function createGroupEvent(
  viewer: FanSeed,
  owner: FanSeed,
  fixture: FixtureSeed,
  run: string,
  title: string,
) {
  const group = await owner.client.rpc("create_group", {
    input_description: "An unlisted group for deterministic assisted-discovery coverage.",
    input_name: "North London Supporters",
    input_slug: `assisted-group-${run}`,
    input_team_id: null as unknown as string,
    input_visibility: "unlisted",
  });
  if (group.error !== null) throw group.error;
  const groupId = group.data.at(0)?.group_id;
  if (groupId === undefined) throw new Error("Group creation returned no ID.");
  const invitation = await owner.client.rpc("create_group_invitation", {
    input_group_id: groupId,
    input_invitee_id: viewer.id,
  });
  if (invitation.error !== null) throw invitation.error;
  const invitationId = invitation.data.at(0)?.invitation_id;
  if (invitationId === undefined) throw new Error("Group invitation returned no ID.");
  const joined = await viewer.client.rpc("respond_group_invitation", {
    input_invitation_id: invitationId,
    input_decision: "accept",
  });
  if (joined.error !== null) throw joined.error;

  const input = eventInput(fixture, title, {
    input_audience: "group",
    input_audience_group_id: groupId,
    input_organizing_group_id: groupId,
  });
  const created = await owner.client.rpc("create_group_event", {
    input_organizing_group_id: groupId,
    input_match_id: input.input_match_id,
    input_title: input.input_title,
    input_description: input.input_description,
    input_expected_activity: input.input_expected_activity,
    input_cost_description: input.input_cost_description,
    input_event_rules: input.input_event_rules,
    input_commercial_affiliation: input.input_commercial_affiliation,
    input_host_presence_confirmed: input.input_host_presence_confirmed,
    input_starts_at: input.input_starts_at,
    input_ends_at: input.input_ends_at,
    input_place_kind: input.input_place_kind,
    input_public_place_name: input.input_public_place_name,
    input_public_address_text: input.input_public_address_text,
    input_public_longitude: input.input_public_longitude,
    input_public_latitude: input.input_public_latitude,
    input_audience: "group",
    input_audience_group_id: groupId,
    input_capacity: input.input_capacity,
    input_private_address_text: input.input_private_address_text,
    input_private_directions: input.input_private_directions,
    input_private_longitude: input.input_private_longitude,
    input_private_latitude: input.input_private_latitude,
    input_intent: "publish",
  });
  if (created.error !== null) throw created.error;
  expect(created.data.at(0)?.status).toBe("published");
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
}

async function search(page: Page, query: string) {
  const queryInput = page.getByRole("textbox", { name: "Ask Huddle what you want to watch" });
  const submitButton = page.getByRole("button", { name: "Send question" });

  await expect(async () => {
    await queryInput.fill("");
    await queryInput.fill(query);
    await expect(submitButton).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await submitButton.click();
}

async function expectAskViewportIntegrity(page: Page, mobileNavigationVisible: boolean) {
  const layout = await page.evaluate(() => {
    const required = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`Missing ${selector}`);
      return element;
    };
    const rectangle = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const composer = required('[data-slot="input-group"]');
    const composerStyle = getComputedStyle(composer);
    const navigation = document.querySelector<HTMLElement>(
      'nav[aria-label="Fan mobile navigation"]',
    );

    return {
      composer: rectangle(composer),
      composerStyle: {
        backgroundColor: composerStyle.backgroundColor,
        borderColor: composerStyle.borderTopColor,
        borderStyle: composerStyle.borderTopStyle,
        borderWidth: composerStyle.borderTopWidth,
      },
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      navigation:
        navigation === null || getComputedStyle(navigation).display === "none"
          ? null
          : rectangle(navigation),
      region: rectangle(required('[aria-label="Ask Huddle conversation"]')),
      reset: rectangle(required('button[aria-label="Start a new search"]')),
      scrollerOverflow: getComputedStyle(required('[data-slot="message-scroller-viewport"]'))
        .overflowY,
      send: rectangle(required('button[aria-label="Send question"]')),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      windowScrollY: window.scrollY,
    };
  });

  expect(layout.windowScrollY).toBe(0);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight + 2);
  expect(layout.region.left).toBeLessThanOrEqual(1);
  expect(layout.region.right).toBeGreaterThanOrEqual(layout.viewportWidth - 1);
  expect(layout.scrollerOverflow).toBe("auto");
  expect(layout.composerStyle.borderWidth).toBe("1px");
  expect(layout.composerStyle.borderStyle).toBe("solid");
  expect(layout.composerStyle.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(layout.composerStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(layout.reset.width).toBeGreaterThanOrEqual(44);
  expect(layout.reset.height).toBeGreaterThanOrEqual(44);
  expect(layout.send.width).toBeGreaterThanOrEqual(44);
  expect(layout.send.height).toBeGreaterThanOrEqual(44);

  if (mobileNavigationVisible) {
    expect(layout.navigation).not.toBeNull();
    expect(layout.navigation!.bottom).toBeGreaterThanOrEqual(layout.viewportHeight - 1);
    expect(layout.composer.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
  } else {
    expect(layout.navigation).toBeNull();
    expect(layout.composer.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  }
}

test("the three core assisted-discovery examples find authorized seeded huddles", async ({
  page,
}) => {
  test.setTimeout(120_000);
  cancelPriorAssistedDiscoveryEvents();
  const run = suffix();
  const viewer = await seedFan(run, "viewer");
  const friend = await seedFan(run, "friend");
  const groupOwner = await seedFan(run, "group-owner");
  const venueOwner = await seedFan(run, "venue-owner");
  const fixtures = await seedFixtures(run, viewer.client);
  const venueTitle = "Match night at The Corner";
  const friendTitle = "Arsenal vs Chelsea with friends";
  const groupTitle = "Champions League supporters watch";
  await createVenueEvent(venueOwner, fixtures.tomorrow, run, venueTitle);
  await createFriendEvent(viewer, friend, fixtures.nextWeek, friendTitle);
  await createGroupEvent(viewer, groupOwner, fixtures.weekend, run, groupTitle);

  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({ lat: 32.8, lng: 35, label: "Haifa", kind: "address" }),
    );
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, viewer.email);
  await page.goto("/ask");

  const conversation = page.getByRole("region", { name: "Ask Huddle conversation" });
  await expect(conversation).toHaveAttribute("data-layout", "immersive");
  await expect(page.locator("main#main-content")).toHaveAttribute("data-shell-mode", "immersive");
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  const conversationBox = await conversation.boundingBox();
  expect(conversationBox?.x).toBeLessThanOrEqual(1);
  expect(conversationBox?.width).toBeGreaterThanOrEqual(374);

  const mobileNavigation = page.getByRole("navigation", { name: "Fan mobile navigation" });
  await expect(mobileNavigation.getByRole("link")).toHaveText([
    "Home",
    "Explore",
    "Ask",
    "My Huddle",
    "People",
  ]);
  await expect(mobileNavigation.getByRole("link", { name: "Ask" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(mobileNavigation.getByRole("link", { name: "Account" })).toHaveCount(0);
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Switch workspace" }),
  ).toBeVisible();
  await expect(page.getByText("What kind of huddle are you after?", { exact: true })).toBeVisible();

  await search(page, "I want to go out tommorow to a premiere league game in a venue serving food");
  await expect(page.getByText(venueTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Arsenal FC" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Chelsea FC" }).first()).toBeVisible();
  await expect(page.getByText("0 going · 40 places left", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByText("Self-listed venue · business identity not checked by Huddle", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("Venue lists food.", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Self-reported venue: Food · Drinks", { exact: true }).first(),
  ).toBeVisible();

  await search(
    page,
    "do any of my friends planned a huddle for the arsenal chelsea game next week",
  );
  await expect(page.getByText(friendTitle, { exact: true })).toBeVisible();
  await expect(page.getByText("Hosted by a friend", { exact: true })).toBeVisible();

  await search(page, "is there groups im a part of that have UCL games planned for this weekend");
  await expect(page.getByText(groupTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "North London Supporters" })).toHaveAttribute(
    "href",
    `/groups/assisted-group-${run}`,
  );
  await expect(page.getByText("From one of your groups", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ask Huddle what you want to watch" }),
  ).toBeInViewport();
  await expect(page.getByRole("banner")).toBeInViewport();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Switch workspace" }),
  ).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const mobilePageHeight = await page.evaluate(() => ({
    document: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }));
  expect(mobilePageHeight.document).toBeLessThanOrEqual(mobilePageHeight.viewport + 2);

  await expectAskViewportIntegrity(page, true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectAskViewportIntegrity(page, true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectAskViewportIntegrity(page, false);
});

test("three result responses stay separated as individual tickets", async ({ page }) => {
  test.setTimeout(60_000);
  const run = suffix();
  const viewer = await seedFan(run, "viewer");
  const startsAt = kickoff(addDays(israelDate(), 2));
  const endsAt = new Date(new Date(startsAt).getTime() + 3 * 60 * 60_000).toISOString();
  const baseResult = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Champions League supporters watch",
    host: {
      kind: "venue" as const,
      displayName: "The Green Room",
      venueSlug: "the-green-room",
      verificationStatus: "unverified" as const,
    },
    match: {
      id: "22222222-2222-4222-8222-222222222222",
      competitionName: "UEFA Champions League",
      homeTeamName: "Arsenal FC",
      homeTeamTla: "ARS",
      homeTeamCrestUrl: "https://crests.football-data.org/57.png",
      awayTeamName: "Chelsea FC",
      awayTeamTla: "CHE",
      awayTeamCrestUrl: "https://crests.football-data.org/61.png",
    },
    group: {
      name: "North London Supporters",
      slug: `assisted-group-${run}`,
      relationship: "organizer" as const,
    },
    startsAt,
    endsAt,
    placeKind: "venue" as const,
    locationSummary: "The Green Room",
    audience: "group" as const,
    attendanceMode: "reservations" as const,
    capacity: 24,
    approvedAttendeeCount: 8,
    remainingCapacity: 16,
    requiresApproval: true,
    viewerParticipationState: null,
    venueFacilities: ["food", "drinks"] as const,
    matchedReasons: ["From one of your groups"],
  };

  await page.route("**/api/assisted-discovery", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        status: "results",
        interpretation: "4–6 Sep · UEFA Champions League · from one of your groups",
        locationLabel: null,
        results: [
          baseResult,
          {
            ...baseResult,
            id: "33333333-3333-4333-8333-333333333333",
            title: "Late kickoff at The Corner",
            host: {
              ...baseResult.host,
              displayName: "The Corner",
              venueSlug: "the-corner",
            },
            locationSummary: "The Corner · 1–5 km away",
            approvedAttendeeCount: 12,
            remainingCapacity: 12,
            viewerParticipationState: "invited",
          },
          {
            ...baseResult,
            id: "44444444-4444-4444-8444-444444444444",
            title: "Supporters club screening",
            host: {
              kind: "person",
              displayName: "Maya Levi",
              venueSlug: null,
              verificationStatus: null,
            },
            placeKind: "public_place",
            locationSummary: "City centre",
            capacity: 18,
            approvedAttendeeCount: 6,
            remainingCapacity: 12,
            venueFacilities: [],
            matchedReasons: ["Hosted by a friend", "From one of your groups"],
          },
        ],
      },
      status: 200,
    });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, viewer.email);
  await page.goto("/ask");
  await search(page, "UCL games from my groups this weekend");

  const tickets = page.locator('[data-presentation="ticket-card"]');
  await expect(tickets).toHaveCount(3);
  await expect(page.getByRole("img", { name: "Arsenal FC" }).first()).toHaveCSS("opacity", "1");
  await expect(page.getByRole("img", { name: "Chelsea FC" }).first()).toHaveCSS("opacity", "1");
  await expect(tickets.nth(0)).toBeVisible();
  await expect(tickets.nth(1)).toBeVisible();
  await expect(tickets.nth(2)).toBeVisible();
  for (const ticket of await tickets.all()) {
    await expect(ticket).toHaveCSS("border-top-style", "solid");
    await expect(ticket).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  }
  await expect(page.getByRole("navigation", { name: "Fan mobile navigation" })).toBeVisible();

  const ticketHeights = await tickets.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(Math.max(...ticketHeights)).toBeLessThanOrEqual(325);

  const scroller = page.locator('[data-slot="message-scroller-viewport"]');
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("banner")).toBeInViewport();

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(tickets.nth(2)).toBeInViewport();
  await expect(page.getByRole("banner")).toBeInViewport();
  await expect(page.locator('[data-slot="chat-composer"]')).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Fan mobile navigation" })).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("a named place overrides the remembered origin while dates stay exact and state stays ephemeral", async ({
  page,
}) => {
  test.setTimeout(120_000);
  cancelPriorAssistedDiscoveryEvents();
  const run = suffix();
  const viewer = await seedFan(run, "jerusalem-viewer");
  const venueOwner = await seedFan(run, "jerusalem-venue-owner");
  const decoyVenueOwner = await seedFan(run, "jerusalem-decoy-owner");
  const fixtures = await seedFixtures(run, viewer.client);
  const title = "Jerusalem midweek watch";
  const decoyTitle = "Jerusalem date decoy";
  await createVenueEvent(venueOwner, fixtures.nextWednesday, run, title, {
    address: "1 Jaffa Street, Jerusalem",
    latitude: 31.778,
    longitude: 35.225,
  });
  await createVenueEvent(decoyVenueOwner, fixtures.nextWeek, `${run}-decoy`, decoyTitle, {
    address: "2 Jaffa Street, Jerusalem",
    latitude: 31.779,
    longitude: 35.224,
  });

  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({ lat: 32.8, lng: 35, label: "Haifa", kind: "address" }),
    );
  });
  await signIn(page, viewer.email);
  await page.goto("/ask");

  await search(page, "Any events in Jerusalem next Wednesday?");
  await expect(page.getByText("Jerusalem, Israel", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use my current location" })).toHaveCount(0);

  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(decoyTitle, { exact: true })).toHaveCount(0);

  const monthSearch = nextMonthSearch(israelDate());
  await search(page, monthSearch.query);
  await expect(
    page.getByLabel("Ask Huddle messages").getByText(monthSearch.interpretation, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(monthSearch.query, { exact: true })).toBeVisible();

  await page.goto("/discover");
  await page
    .getByRole("navigation", { name: "Fan navigation" })
    .getByRole("link", { name: "Ask Huddle", exact: true })
    .click();
  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/ask$/);
  await expect(page.getByText(monthSearch.query, { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Ask Huddle messages").getByText(monthSearch.interpretation, { exact: true }),
  ).toHaveCount(0);
});
