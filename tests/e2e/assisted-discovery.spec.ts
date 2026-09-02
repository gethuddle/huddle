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
  const activated = await client.rpc("activate_fan_workspace", {
    input_adult_attested: true,
    input_bio: "",
    input_display_name: `Assisted ${role} ${run}`,
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
    input_public_place_name: "Assisted Test Hall",
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
    input_name: `Assisted Venue ${run}`,
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
    input_name: `Assisted Group ${run}`,
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
  const queryInput = page.getByRole("textbox", { name: "Describe the huddle you want" });
  const submitButton = page.getByRole("button", { name: "Find huddles" });

  await expect(async () => {
    await queryInput.fill("");
    await queryInput.fill(query);
    await expect(submitButton).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await submitButton.click();
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
  const venueTitle = `Food venue huddle ${run}`;
  const friendTitle = `Friend Arsenal Chelsea huddle ${run}`;
  const groupTitle = `Group UCL huddle ${run}`;
  await createVenueEvent(venueOwner, fixtures.tomorrow, run, venueTitle);
  await createFriendEvent(viewer, friend, fixtures.nextWeek, friendTitle);
  await createGroupEvent(viewer, groupOwner, fixtures.weekend, run, groupTitle);

  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({ lat: 32.8, lng: 35, label: "Haifa", kind: "address" }),
    );
  });
  await signIn(page, viewer.email);
  await expect(
    page.getByRole("heading", { name: "What kind of huddle are you after?" }),
  ).toBeVisible();

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
  await expect(page.getByText("Self-reported: Food", { exact: true }).first()).toBeVisible();

  await search(
    page,
    "do any of my friends planned a huddle for the arsenal chelsea game next week",
  );
  await expect(page.getByText(friendTitle, { exact: true })).toBeVisible();
  await expect(page.getByText("Hosted by a friend", { exact: true })).toBeVisible();

  await search(page, "is there groups im a part of that have UCL games planned for this weekend");
  await expect(page.getByText(groupTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `Assisted Group ${run}` })).toHaveAttribute(
    "href",
    `/groups/assisted-group-${run}`,
  );
  await expect(page.getByText("From one of your groups", { exact: true })).toBeVisible();
});

test("a named place overrides the remembered origin and next Wednesday stays exact", async ({
  page,
}) => {
  test.setTimeout(120_000);
  cancelPriorAssistedDiscoveryEvents();
  const run = suffix();
  const viewer = await seedFan(run, "jerusalem-viewer");
  const venueOwner = await seedFan(run, "jerusalem-venue-owner");
  const decoyVenueOwner = await seedFan(run, "jerusalem-decoy-owner");
  const fixtures = await seedFixtures(run, viewer.client);
  const title = `Jerusalem weekday huddle ${run}`;
  const decoyTitle = `Jerusalem weekday decoy ${run}`;
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

  await page.route("**/api/locations/search", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        suggestions: [
          {
            id: "jerusalem-test",
            label: "Jerusalem, Israel",
            latitude: 31.778,
            longitude: 35.225,
          },
        ],
      }),
    });
  });
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({ lat: 32.8, lng: 35, label: "Haifa", kind: "address" }),
    );
  });
  await signIn(page, viewer.email);

  await search(page, "Any events in Jerusalem next Wednesday?");
  await expect(
    page.getByRole("heading", { name: "Confirm Jerusalem as the search area" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use my current location" })).toHaveCount(0);
  const locationInput = page.getByRole("combobox", { name: "Area or address" });
  await expect(locationInput).toHaveValue("Jerusalem");
  await page.getByRole("option", { name: "Jerusalem, Israel" }).click();

  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(decoyTitle, { exact: true })).toHaveCount(0);
});
