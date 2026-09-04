import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import type { Database } from "@/types/database.generated";

const password = "matchday-local-test";

type Fixture = Readonly<{
  matchId: string;
  startsAt: string;
  homeTeamId: string;
  homeName: string;
  awayName: string;
}>;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 10);
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
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

async function seedFan(run: string, role: string) {
  const email = `calm-${run}-${role}@example.com`;
  const roleKey = createHash("sha256").update(role).digest("hex").slice(0, 6);
  const handle = `c_${run}_${roleKey}`;
  const displayName = `Calm ${role} ${run}`;
  const admin = localAdminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error !== null) throw created.error;
  const client = await localUserClient(email);
  const activated = await client.rpc("activate_fan_workspace", {
    input_adult_attested: true,
    input_bio: "",
    input_display_name: displayName,
    input_handle: handle,
    input_rules_version: 1,
  });
  if (activated.error !== null) throw activated.error;
  return { client, displayName, email, handle, id: created.data.user.id } as const;
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
}

async function seedFixture(run: string): Promise<Fixture> {
  const admin = localAdminClient();
  const now = new Date();
  const kickoff = new Date(now.getTime() + 4 * 86_400_000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const homeExternalId = `calm-${run}-home`;
  const awayExternalId = `calm-${run}-away`;
  const matchExternalId = `calm-${run}-match`;
  const homeName = `North ${run} FC`;
  const awayName = `South ${run} FC`;

  const started = await admin.rpc("begin_sports_sync", {
    input_provider: "football-data",
    input_window_start: date(now),
    input_window_end: date(new Date(now.getTime() + 30 * 86_400_000)),
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
    ],
    input_teams: [
      {
        provider_external_id: homeExternalId,
        name: homeName,
        short_name: `North ${run}`,
        tla: "NOR",
        country_name: "England",
      },
      {
        provider_external_id: awayExternalId,
        name: awayName,
        short_name: `South ${run}`,
        tla: "SOU",
        country_name: "England",
      },
    ],
    input_competition_teams: [homeExternalId, awayExternalId].map((teamExternalId) => ({
      competition_external_id: "2021",
      team_external_id: teamExternalId,
      season_label: "2026",
    })),
    input_matches: [
      {
        provider_external_id: matchExternalId,
        competition_external_id: "2021",
        home_team_external_id: homeExternalId,
        away_team_external_id: awayExternalId,
        starts_at: kickoff.toISOString(),
        status: "timed",
        matchday: 1,
        stage: "REGULAR_SEASON",
        season_label: "2026",
      },
    ],
    input_request_count: 1,
    input_retry_count: 0,
  });
  if (completed.error !== null) throw completed.error;

  const match = localDatabaseRows<{ id: string; starts_at: string; home_team_id: string }>(`
    select id, starts_at, home_team_id
    from public.matches
    where provider = 'football-data'
      and provider_external_id = ${sqlLiteral(matchExternalId)};
  `).at(0);
  if (match === undefined) throw new Error("The focused fixture is incomplete.");
  return {
    matchId: match.id,
    startsAt: match.starts_at,
    homeTeamId: match.home_team_id,
    homeName,
    awayName,
  };
}

function eventInput(
  fixture: Fixture,
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
    input_description: "A focused calm-UX event for deterministic action-flow coverage.",
    input_expected_activity: "Watch the match together",
    input_cost_description: "Free",
    input_event_rules: "Respect the host and every attendee.",
    input_commercial_affiliation: "None",
    input_host_presence_confirmed: true,
    input_starts_at: startsAt.toISOString(),
    input_ends_at: new Date(startsAt.getTime() + 3 * 3_600_000).toISOString(),
    input_place_kind: "home",
    input_venue_id: null as unknown as string,
    input_public_place_name: null as unknown as string,
    input_public_address_text: null as unknown as string,
    input_public_longitude: null as unknown as number,
    input_public_latitude: null as unknown as number,
    input_audience: "invite_only",
    input_audience_team_id: null as unknown as string,
    input_audience_group_id: null as unknown as string,
    input_capacity: 8,
    input_requires_approval: true,
    input_private_address_text: `44 Calm ${title}, Haifa`,
    input_private_directions: "Use the private entrance.",
    input_private_longitude: 34.998,
    input_private_latitude: 32.812,
    input_intent: "publish",
    ...overrides,
  };
}

async function createPrivateEvent(
  client: SupabaseClient<Database>,
  fixture: Fixture,
  title: string,
) {
  const result = await client.rpc("create_or_update_event", eventInput(fixture, title));
  if (result.error !== null) throw result.error;
  const eventId = result.data.at(0)?.event_id;
  if (eventId === undefined) throw new Error("Private event creation returned no ID.");
  return eventId;
}

async function createVenueEvent(client: SupabaseClient<Database>, fixture: Fixture, run: string) {
  const name = `Calm Venue ${run}`;
  const slug = `calm-venue-${run}`;
  const venue = await client.rpc("create_venue_workspace_v2", {
    input_address_text: `12 Calm ${run} Street, Haifa`,
    input_adult_attested: true,
    input_default_attendance_mode: "reservations",
    input_default_requires_approval: false,
    input_description: "A public Venue used for calm-UX regression coverage.",
    input_facilities: ["wheelchair_accessible"],
    input_house_information: "Use the main entrance.",
    input_latitude: 32.81303,
    input_longitude: 34.99928,
    input_main_space_capacity: 80,
    input_main_space_name: "Main screen",
    input_name: name,
    input_representation_attested: true,
    input_rules_version: 1,
    input_slug: slug,
  });
  if (venue.error !== null) throw venue.error;
  const venueId = venue.data.at(0)?.venue_id;
  if (venueId === undefined) throw new Error("Venue creation returned no ID.");
  // Public-event fixture only; ordinary venue creation must remain inactive.
  localDatabaseRows(`
    update private.venue_billing_entitlements
    set status = 'active', interval = 'month', interval_count = 1,
        polar_customer_id = 'test-customer-' || venue_id,
        polar_subscription_id = 'test-subscription-' || venue_id,
        polar_product_id = 'test-product', polar_product_price_id = 'test-price',
        amount = 1500, currency = 'ils', paid_through_at = statement_timestamp() + interval '365 days'
    where venue_id = ${sqlLiteral(venueId)}::uuid returning venue_id;
  `);
  const title = `Calm public event ${run}`;
  const result = await client.rpc(
    "create_or_update_event",
    eventInput(fixture, title, {
      input_host_venue_id: venueId,
      input_place_kind: "venue",
      input_venue_id: venueId,
      input_audience: "public",
      input_private_address_text: null as unknown as string,
      input_private_directions: null as unknown as string,
      input_private_longitude: null as unknown as number,
      input_private_latitude: null as unknown as number,
      input_capacity: 40,
      input_requires_approval: false,
    }),
  );
  if (result.error !== null) throw result.error;
  const eventId = result.data.at(0)?.event_id;
  if (eventId === undefined) throw new Error("Venue event creation returned no ID.");
  return { eventId, name, slug, title, venueId } as const;
}

async function secondSession(context: BrowserContext, email: string) {
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

test("Explore exact-fixture search preserves its route context", async ({ page }) => {
  const run = suffix();
  const viewer = await seedFan(run, "viewer");
  const host = await seedFan(run, "host");
  const fixture = await seedFixture(run);
  const venueEvent = await createVenueEvent(host.client, fixture, run);
  await page.context().grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.context().setGeolocation({ latitude: 32.81303, longitude: 34.99928 });
  await signIn(page, viewer.email);

  await page.goto(`/discover?team=${fixture.homeTeamId}`);
  await expect(page.getByText(venueEvent.title, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change Explore search" }).click();
  await page.getByRole("searchbox", { name: "Specific fixture (optional)" }).fill(fixture.homeName);
  await page.getByRole("button", { name: "Find fixtures" }).click();
  await page
    .getByRole("button", { name: new RegExp(`${fixture.homeName}.*${fixture.awayName}`) })
    .click();
  await page.getByRole("button", { name: "Show events" }).click();

  await expect(page).toHaveURL(new RegExp(`[?&]match=${fixture.matchId}(?:&|$)`));
  expect(new URL(page.url()).searchParams.get("team")).toBe("");
  await page.getByRole("button", { name: "Change Explore search" }).click();
  await expect(page.getByLabel("Selected fixture")).toContainText(
    `North ${run} vs South ${run} — Premier League`,
  );
  await page.keyboard.press("Escape");

  const eventHref = await page.getByRole("link", { name: "Open event" }).getAttribute("href");
  expect(eventHref).not.toBeNull();
  await page.goto(eventHref ?? "/discover");
  const detailUrl = new URL(page.url());
  expect(detailUrl.pathname).toBe(`/events/${venueEvent.eventId}`);
  expect(detailUrl.searchParams.get("returnTo")).toContain(`match=${fixture.matchId}`);
  await page.getByRole("link", { name: "Back to Explore" }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]match=${fixture.matchId}(?:&|$)`));
  expect(new URL(page.url()).searchParams.get("match")).toBe(fixture.matchId);
});

test("friend request cancel, decline, accept, and removal stay understandable", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const run = suffix();
  const cancelRequester = await seedFan(run, "cancel_requester");
  const cancelTarget = await seedFan(run, "cancel_target");
  const declineRequester = await seedFan(run, "decline_requester");
  const declineTarget = await seedFan(run, "decline_target");
  const acceptedRequester = await seedFan(run, "accepted_requester");
  const acceptedTarget = await seedFan(run, "accepted_target");
  await signIn(page, cancelRequester.email);
  await page.goto(`/people/${cancelTarget.handle}`);
  await page.getByRole("button", { name: "Add friend" }).click();
  await expect(page.getByRole("status")).toContainText("Friend request sent.");
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByRole("status")).toContainText("Friend request cancelled.");
  await expect(page.getByRole("button", { name: "Add friend" })).toBeVisible();

  const declineRequest = await declineRequester.client.rpc("request_friendship_by_handle", {
    target_handle: declineTarget.handle,
  });
  if (declineRequest.error !== null) throw declineRequest.error;
  const declineContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    const declinePage = await secondSession(declineContext, declineTarget.email);
    await declinePage.goto(`/people/${declineRequester.handle}`);
    await declinePage.getByRole("button", { name: "Decline" }).click();
    await expect(declinePage.getByRole("status")).toContainText("Friend request declined.");
    await expect(declinePage.getByRole("button", { name: "Add friend" })).toBeVisible();
  } finally {
    await declineContext.close();
  }

  const acceptedRequest = await acceptedRequester.client.rpc("request_friendship_by_handle", {
    target_handle: acceptedTarget.handle,
  });
  if (acceptedRequest.error !== null) throw acceptedRequest.error;
  const acceptedContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    const acceptedPage = await secondSession(acceptedContext, acceptedTarget.email);
    await acceptedPage.goto(`/people/${acceptedRequester.handle}`);
    await acceptedPage.getByRole("button", { name: "Accept" }).click();
    await expect(acceptedPage.getByText("Friends", { exact: true })).toBeVisible();
    await acceptedPage.getByRole("button", { name: "Remove friend" }).click();
    await acceptedPage.getByRole("button", { name: "Confirm removal" }).click();
    await expect(acceptedPage.getByRole("status")).toContainText("Friend removed.");
    await expect(acceptedPage.getByRole("button", { name: "Add friend" })).toBeVisible();
  } finally {
    await acceptedContext.close();
  }
});

test("secure event links create an invitation, support decline, and can be revoked", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const run = suffix();
  const host = await seedFan(run, "host");
  const invitee = await seedFan(run, "invitee");
  const fixture = await seedFixture(run);
  const title = `Calm private event ${run}`;
  const eventId = await createPrivateEvent(host.client, fixture, title);
  await signIn(page, host.email);
  const inviteeContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const inviteePage = await secondSession(inviteeContext, invitee.email);

  try {
    await page.goto(`/events/${eventId}/manage`);
    await page.getByRole("button", { name: "Create link" }).click();
    const firstPath = await page.getByLabel("New invite link").inputValue();
    expect(firstPath).toMatch(/^\/join\/event\/[A-Za-z0-9_-]+$/);

    await inviteePage.goto(firstPath);
    await inviteePage.getByRole("button", { name: "Continue to invitation" }).click();
    await expect(inviteePage.getByRole("status")).toContainText("Invitation added.");
    await inviteePage.getByRole("link", { name: "Open invitation" }).click();
    await expect(inviteePage.getByRole("heading", { name: title })).toBeVisible();
    await expect(inviteePage.getByText(/44 Calm/)).toHaveCount(0);
    await inviteePage.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(inviteePage).toHaveURL(/\/dashboard\?notice=invitation-declined$/);
    await expect(inviteePage.getByRole("status")).toContainText("Invitation declined.");
    await expect(inviteePage.getByText(title, { exact: true })).toHaveCount(0);

    await page.goto(`/events/${eventId}/manage`);
    await page.getByRole("button", { name: "Create link" }).click();
    const revokedPath = await page.getByLabel("New invite link").inputValue();
    await page.reload();
    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect(page.getByRole("status")).toContainText("Invite link revoked.");
    await inviteePage.goto(revokedPath);
    await inviteePage.getByRole("button", { name: "Continue to invitation" }).click();
    await expect(
      inviteePage.getByRole("alert").filter({ hasText: "That invitation is not available." }),
    ).toBeVisible();
  } finally {
    await inviteeContext.close();
  }
});

test("member submissions can be withdrawn and a different owner can reject them", async ({
  browser,
  page,
}) => {
  const run = suffix();
  const owner = await seedFan(run, "owner");
  const withdrawingMember = await seedFan(run, "withdrawing_member");
  const reviewedMember = await seedFan(run, "reviewed_member");
  const fixture = await seedFixture(run);
  const slug = `calm-group-${run}`;
  const group = await owner.client.rpc("create_group", {
    input_description: "A private general group used for calm review-flow coverage.",
    input_name: `Calm Group ${run}`,
    input_slug: slug,
    input_team_id: null as unknown as string,
    input_visibility: "discoverable",
  });
  if (group.error !== null) throw group.error;
  const groupId = group.data.at(0)?.group_id;
  if (groupId === undefined) throw new Error("Group creation returned no ID.");
  const activeGroupId = groupId;
  for (const member of [withdrawingMember, reviewedMember]) {
    const application = await member.client.rpc("apply_to_group", {
      input_group_id: activeGroupId,
      input_message: "Please add me to the group.",
    });
    if (application.error !== null) throw application.error;
    const approved = await owner.client.rpc("review_group_membership", {
      input_group_id: activeGroupId,
      input_user_id: member.id,
      input_decision: "approve",
    });
    if (approved.error !== null) throw approved.error;
  }

  async function submit(client: SupabaseClient<Database>, title: string) {
    const input = eventInput(fixture, title, {
      input_audience: "group",
      input_audience_group_id: activeGroupId,
      input_organizing_group_id: activeGroupId,
    });
    const result = await client.rpc("create_group_event", {
      input_organizing_group_id: activeGroupId,
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
      input_audience: input.input_audience,
      input_audience_group_id: activeGroupId,
      input_capacity: input.input_capacity,
      input_private_address_text: input.input_private_address_text,
      input_private_directions: input.input_private_directions,
      input_private_longitude: input.input_private_longitude,
      input_private_latitude: input.input_private_latitude,
      input_intent: "publish",
    });
    if (result.error !== null) throw result.error;
    return result.data.at(0)?.event_id;
  }

  await signIn(page, withdrawingMember.email);
  const ownerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const ownerPage = await secondSession(ownerContext, owner.email);
  try {
    const withdrawTitle = `Withdraw me ${run}`;
    await submit(withdrawingMember.client, withdrawTitle);
    const promoted = await owner.client.rpc("change_group_member_role", {
      input_group_id: activeGroupId,
      input_user_id: withdrawingMember.id,
      input_role: "admin",
    });
    if (promoted.error !== null) throw promoted.error;
    await page.goto(`/groups/${slug}`);
    const ownSubmission = page.getByRole("article").filter({ hasText: withdrawTitle });
    await expect(ownSubmission.getByText(/cannot review your own submission/i)).toBeVisible();
    await ownSubmission.getByRole("button", { name: "Withdraw submission" }).click();
    await page.getByRole("button", { name: "Withdraw event" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${slug}\\?notice=event-withdrawn$`));
    await expect(page.getByRole("status")).toContainText("Event submission withdrawn and removed");

    const rejectTitle = `Reject me ${run}`;
    await submit(reviewedMember.client, rejectTitle);
    await ownerPage.goto(`/groups/${slug}`);
    const review = ownerPage.getByRole("article").filter({ hasText: rejectTitle });
    await expect(review.getByRole("button", { name: "Approve and publish" })).toBeVisible();
    await review.getByRole("button", { name: "Reject" }).click();
    await ownerPage.getByRole("button", { name: "Reject event" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/groups/${slug}\\?notice=event-rejected$`));
    await expect(ownerPage.getByRole("status")).toContainText("Group event rejected");
  } finally {
    await ownerContext.close();
  }
});

test("closing a Venue removes its live pages and cancels future events", async ({
  browser,
  page,
}) => {
  const run = suffix();
  const owner = await seedFan(run, "owner");
  const fixture = await seedFixture(run);
  const venue = await createVenueEvent(owner.client, fixture, run);
  await signIn(page, owner.email);

  await page.goto(`/venues/${venue.slug}/workspace/settings`);
  await page.getByRole("button", { name: "Close venue", exact: true }).click();
  await page.getByRole("textbox", { name: "Venue name" }).fill(venue.name);
  await page.getByRole("button", { name: "Close venue permanently" }).click();
  await expect(page).toHaveURL(new RegExp(`/venues/${venue.slug}/billing$`));
  await expect(page.getByRole("heading", { name: "Billing for a closed venue" })).toBeVisible();

  const storedEvent = localDatabaseRows<{ status: string }>(`
    select status::text
    from public.events
    where id = ${sqlLiteral(venue.eventId)}::uuid;
  `).at(0);
  expect(storedEvent?.status).toBe("cancelled");

  const anonymous = await browser.newPage({ baseURL: "http://127.0.0.1:3000" });
  try {
    await anonymous.goto(`/venues/${venue.slug}`);
    await expect(
      anonymous.getByRole("heading", { name: "This page isn’t available." }),
    ).toBeVisible();
  } finally {
    await anonymous.close();
  }
});
