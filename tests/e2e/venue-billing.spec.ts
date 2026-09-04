import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";

import activeFixture from "@/tests/fixtures/polar/subscription-active.json";
import pastDueFixture from "@/tests/fixtures/polar/subscription-past-due.json";
import recoveredFixture from "@/tests/fixtures/polar/subscription-recovered.json";
import type { Database } from "@/types/database.generated";

const password = "matchday-local-test";
const day = 86_400_000;
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
function rows<T>(query: string): T[] {
  return JSON.parse(
    execFileSync(
      path.join(process.cwd(), "node_modules/.bin/supabase"),
      ["db", "query", "--local", "--agent", "no", "--output", "json", query],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ) as T[];
}
function client(serviceRole = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Billing acceptance requires the local Supabase environment.");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
async function actor(run: string, role: string) {
  const email = `vb01-${run}-${role}@example.test`;
  const created = await client(true).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const api = client();
  const signedIn = await api.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const activated = await api.rpc("activate_fan_workspace", {
    input_adult_attested: true,
    input_rules_version: 1,
    input_handle: `b_${run}_${role}`,
    input_display_name: `Local ${role}`,
    input_bio: "",
  });
  if (activated.error) throw activated.error;
  return { id: created.data.user.id, email, api };
}
async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/^http:\/\/(?:localhost|127\.0\.0\.1):3000\/$/);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
async function neutralFanPage(page: Page) {
  // The report form's static safety guidance mentions payment data. Exempt only
  // this exact sentence, not the form or any other payment/billing disclosure.
  const reportSafetyGuidance =
    "Explain what happened without adding passwords, payment data, invite links, or another person's exact home address.";
  await expect
    .poll(async () =>
      (await page.getByRole("main").textContent())
        ?.replace(/\s+/g, " ")
        .replace(reportSafetyGuidance, ""),
    )
    .not.toMatch(/billing|polar|payment|subscription|invoice|grace/i);
}
function forbidPolar(context: BrowserContext, attempted: string[]) {
  // Parsed host equality/suffix avoids both false negatives and unrelated names.
  return context.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === "polar.sh" || hostname.endsWith(".polar.sh")) {
      attempted.push(hostname);
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
}

for (const width of [1280, 375]) {
  test(`offline signed venue billing lifecycle at ${width}px`, async ({
    browser,
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    expect(process.env.HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK).toBe("true");
    const attempted: string[] = [];
    await forbidPolar(context, attempted);
    const run = randomUUID().replaceAll("-", "").slice(0, 8);
    const owner = await actor(run, "owner");
    const manager = await actor(run, "admin");
    const attendee = await actor(run, "fan");
    const stranger = await actor(run, "other");
    let slug = `offline-venue-${run}`;
    const venueName = `Offline Venue ${run}`;
    const contexts: BrowserContext[] = [];
    async function actorPage(email: string) {
      const isolated = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: { width, height: 900 },
      });
      contexts.push(isolated);
      await forbidPolar(isolated, attempted);
      const result = await isolated.newPage();
      await signIn(result, email);
      return result;
    }
    try {
      await signIn(page, owner.email);
      await page.route("**/api/locations/search", (route) =>
        route.fulfill({
          json: {
            suggestions: [
              {
                id: `billing-address-${run}`,
                label: "12 Hanassi Boulevard, Haifa, Israel",
                latitude: 32.81303,
                longitude: 34.99928,
              },
            ],
          },
        }),
      );
      await page.goto("/onboarding/venue");
      await page.getByRole("textbox", { name: "Venue name" }).fill(venueName);
      await expect(page.getByRole("textbox", { name: "Huddle page address" })).toHaveCount(0);
      await page.getByRole("combobox", { name: "Public address" }).fill("12 Hanassi Boulevard");
      await page.getByRole("option", { name: "12 Hanassi Boulevard, Haifa, Israel" }).click();
      await page
        .getByRole("textbox", { name: "Public description" })
        .fill("A local-only venue proving the signed Sandbox entitlement journey.");
      await page.getByRole("spinbutton", { name: "Capacity" }).fill("40");
      await page
        .getByRole("checkbox", { name: /authorized to manage its Huddle listing/i })
        .click();
      await page.getByRole("button", { name: "Create venue account" }).click();
      await expect(page).toHaveURL(new RegExp(`/venues/${slug}/workspace/billing$`));
      await expect(page.getByRole("heading", { name: "Venue billing" })).toBeVisible();
      await expect(page.getByText("Venue is private", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Billing", exact: true })).toHaveCount(0);
      await expect(page.getByRole("radio")).toHaveCount(2);
      await expect(page.getByRole("radio", { name: "Monthly — ₪15/month" })).toBeChecked();
      await expect(page.getByRole("radio", { name: "Annual — ₪150/year" })).toBeVisible();
      await expect(page.getByText(/No real money will be charged/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue to demo checkout" })).toBeVisible();
      await noOverflow(page);
      // Never click checkout: the real application provider gateway is denied.
      const venue = rows<{ id: string; status: string }>(`
        select v.id, e.status from public.venues v
        join private.venue_billing_entitlements e on e.venue_id = v.id
        where v.slug = ${sql(slug)};
      `)[0];
      expect(venue.status).toBe("inactive");
      const duplicate = await owner.api.rpc("create_venue_workspace_auto", {
        input_name: venueName,
        input_address_text: "12 Hanassi Boulevard, Haifa, Israel",
        input_longitude: 34.99928,
        input_latitude: 32.81303,
        input_description: "A second local-only venue testing an automatic address collision.",
        input_main_space_name: "Main screen",
        input_main_space_capacity: 40,
        input_facilities: [],
        input_house_information: "Respect other fans.",
        input_default_attendance_mode: "reservations",
        input_default_requires_approval: true,
        input_adult_attested: true,
        input_representation_attested: true,
        input_rules_version: 1,
      });
      expect(duplicate.error).toBeNull();
      expect(duplicate.data?.[0]?.slug).toBe(`${slug}-2`);
      rows(`insert into public.venue_memberships (venue_id,user_id,role)
        values (${sql(venue.id)}::uuid,${sql(manager.id)}::uuid,'admin') returning venue_id;`);
      const adminPage = await actorPage(manager.email);
      await adminPage.goto(`/venues/${slug}/workspace/billing`);
      await expect(adminPage.getByText("Venue is private", { exact: true })).toBeVisible();
      await expect(adminPage.getByText("Only the venue owner can manage billing.")).toBeVisible();
      await expect(adminPage.getByRole("radio")).toHaveCount(0);
      await expect(adminPage.getByRole("button", { name: /checkout|portal/i })).toHaveCount(0);
      await noOverflow(adminPage);
      const otherPage = await actorPage(stranger.email);
      await otherPage.goto(`/venues/${slug}`);
      await expect(
        otherPage.getByRole("heading", { name: "This page isn’t available." }),
      ).toBeVisible();
      await expect(otherPage.getByRole("heading", { name: venueName, exact: true })).toHaveCount(0);
      await neutralFanPage(otherPage);
      await page.getByRole("link", { name: "Return to workspace" }).click();
      await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "View public page" })).toHaveCount(0);

      const reserved = await owner.api.rpc("reserve_venue_billing_checkout", {
        input_venue_id: venue.id,
        input_interval: "month",
        input_request_id: randomUUID(),
      });
      if (reserved.error) throw reserved.error;
      const attemptId = reserved.data[0].attempt_id;
      const checkoutId = randomUUID();
      const subscriptionId = randomUUID();
      const customerId = randomUUID();
      const priceId = randomUUID();
      const epoch = Date.now() - 60_000;
      const paidThrough = new Date(epoch + 30 * day).toISOString();
      const attached = await client(true).rpc("attach_venue_billing_checkout", {
        input_attempt_id: attemptId,
        input_checkout_id: checkoutId,
        input_checkout_expires_at: new Date(Date.now() + day).toISOString(),
        input_organization_id: activeFixture.data.product.organization_id,
        input_product_id: activeFixture.data.product_id,
        input_product_price_id: priceId,
        input_amount: 1500,
        input_currency: "ils",
        input_interval: "month",
        input_interval_count: 1,
        input_external_customer_id: owner.id,
        input_request_id: randomUUID(),
      });
      if (attached.error) throw attached.error;
      async function webhook(
        fixture: typeof activeFixture | typeof pastDueFixture,
        sequence: number,
      ) {
        const timestamp = new Date(epoch + sequence * 1000).toISOString();
        const payload = {
          ...fixture,
          timestamp,
          data: {
            ...fixture.data,
            id: subscriptionId,
            modified_at: timestamp,
            current_period_end: paidThrough,
            past_due_at: fixture.type === "subscription.past_due" ? timestamp : null,
            checkout_id: checkoutId,
            customer_id: customerId,
            customer: { id: customerId, external_id: owner.id },
            prices: [{ ...fixture.data.prices[0], id: priceId }],
            metadata: {
              ...fixture.data.metadata,
              huddle_venue_id: venue.id,
              huddle_checkout_attempt_id: attemptId,
            },
          },
        };
        const body = JSON.stringify(payload);
        const id = `local-${run}-${sequence}`;
        const signedAt = String(Math.floor(Date.now() / 1000));
        const secret = process.env.POLAR_WEBHOOK_SECRET;
        if (!secret) throw new Error("Local webhook signing secret is missing.");
        const signature = createHmac("sha256", secret)
          .update(`${id}.${signedAt}.${body}`)
          .digest("base64");
        const response = await page.request.post("/api/polar/webhooks", {
          data: body,
          headers: {
            "Content-Type": "application/json",
            "webhook-id": id,
            "webhook-timestamp": signedAt,
            "webhook-signature": `v1,${signature}`,
          },
        });
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual({ received: true });
      }
      await webhook(activeFixture, 1);
      await page.goto(`/venues/${slug}/workspace/billing`);
      await expect(page.getByText("Venue is public", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open billing portal" })).toBeVisible();
      await adminPage.reload();
      await expect(adminPage.getByText("Venue is public", { exact: true })).toBeVisible();
      await expect(adminPage.getByRole("button", { name: /checkout|portal/i })).toHaveCount(0);
      await noOverflow(adminPage);
      await otherPage.reload();
      await expect(otherPage.getByRole("heading", { name: venueName, exact: true })).toBeVisible();
      await expect(
        otherPage.getByLabel("Self-listed venue · business identity not checked by Huddle"),
      ).toBeVisible();

      // A locally normalized catalog fixture 120 days away proves that active
      // publishing has no paid-through event-date horizon.
      const kickoff = new Date(epoch + 120 * day).toISOString();
      const fixtureMatch = rows<{ id: string }>(`
        with sport as (select id from public.sports where slug = 'football'),
        competition as (
          insert into public.competitions(sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
          select id,'football-data',${sql(`vb01-${run}-league`)},'VB01','Local Match League','Israel',statement_timestamp() from sport returning id,sport_id
        ), home as (
          insert into public.teams(sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
          select sport_id,'football-data',${sql(`vb01-${run}-home`)},'Local North','North','NOR','Israel',statement_timestamp() from competition returning id
        ), away as (
          insert into public.teams(sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
          select sport_id,'football-data',${sql(`vb01-${run}-away`)},'Local South','South','SOU','Israel',statement_timestamp() from competition returning id
        )
        insert into public.matches(competition_id,home_team_id,away_team_id,provider,provider_external_id,starts_at,status,last_synced_at)
        select competition.id,home.id,away.id,'football-data',${sql(`vb01-${run}-match`)},${sql(kickoff)}::timestamptz,'timed',statement_timestamp()
        from competition,home,away returning id;
      `)[0];
      const title = `Distant match ${run}`;
      const input: Database["public"]["Functions"]["create_or_update_event"]["Args"] = {
        input_event_id: null as unknown as string,
        input_host_venue_id: venue.id,
        input_organizing_group_id: null as unknown as string,
        input_match_id: fixtureMatch.id,
        input_title: title,
        input_description: "A distant local match for supporters to watch together.",
        input_expected_activity: "Watch the full match together",
        input_cost_description: "Free",
        input_event_rules: "Respect staff and supporters.",
        input_commercial_affiliation: "Hosted by the venue",
        input_host_presence_confirmed: true,
        input_starts_at: kickoff,
        input_ends_at: new Date(Date.parse(kickoff) + 3 * 3_600_000).toISOString(),
        input_place_kind: "venue",
        input_venue_id: venue.id,
        input_public_place_name: null as unknown as string,
        input_public_address_text: null as unknown as string,
        input_public_longitude: null as unknown as number,
        input_public_latitude: null as unknown as number,
        input_audience: "public",
        input_audience_team_id: null as unknown as string,
        input_audience_group_id: null as unknown as string,
        input_capacity: 20,
        input_requires_approval: false,
        input_private_address_text: null as unknown as string,
        input_private_directions: null as unknown as string,
        input_private_longitude: null as unknown as number,
        input_private_latitude: null as unknown as number,
        input_intent: "publish",
      };
      const published = await owner.api.rpc("create_or_update_event", input);
      if (published.error) throw published.error;
      const eventId = published.data[0].event_id;
      const joined = await attendee.api.rpc("request_or_join_event", { input_event_id: eventId });
      if (joined.error) throw joined.error;
      const fanPage = await actorPage(attendee.email);
      await fanPage.goto(`/events/${eventId}`);
      await expect(fanPage.getByRole("heading", { name: title, exact: true })).toBeVisible();

      await webhook(pastDueFixture, 2);
      await otherPage.reload();
      await expect(
        otherPage.getByRole("heading", { name: "This page isn’t available." }),
      ).toBeVisible();
      await expect(otherPage.getByRole("heading", { name: venueName, exact: true })).toHaveCount(0);
      await otherPage.goto(`/events/${eventId}`);
      await expect(
        otherPage.getByRole("heading", { name: "This page isn’t available." }),
      ).toBeVisible();
      await expect(otherPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
      await neutralFanPage(otherPage);
      await fanPage.reload();
      await expect(fanPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await neutralFanPage(fanPage);
      for (const managementPage of [page, adminPage]) {
        await managementPage.goto(`/venues/${slug}/workspace/billing`);
        await expect(
          managementPage.getByText(/Your venue and events are hidden\. Update/),
        ).toBeVisible();
        await expect(managementPage.getByText("Venue is private", { exact: true })).toBeVisible();
        await noOverflow(managementPage);
      }
      await expect(page.getByRole("button", { name: "Open billing portal" })).toBeVisible();
      await expect(adminPage.getByRole("button", { name: /checkout|portal/i })).toHaveCount(0);
      await adminPage.goto(`/venues/${slug}/workspace/events`);
      await expect(adminPage.getByRole("link", { name: new RegExp(title) })).toBeVisible();
      await adminPage.goto(`/events/${eventId}/manage`);
      await expect(adminPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(
        adminPage.getByRole("link", { name: `Local fan · @b_${run}_fan`, exact: true }),
      ).toHaveAttribute("href", `/people/b_${run}_fan`);
      await expect(
        adminPage.getByRole("link", { name: `Local fan · @b_${run}_fan`, exact: true }),
      ).toBeVisible();

      const sweep = await client(true).rpc("run_venue_billing_deadline_sweep", {
        input_now: new Date(epoch + 8 * day).toISOString(),
        input_limit: 100,
        audit_request_id: randomUUID(),
      });
      if (sweep.error) throw sweep.error;
      expect(sweep.data).toContainEqual(
        expect.objectContaining({
          venue_id: venue.id,
          next_status: "expired",
          cancelled_event_count: 1,
        }),
      );
      await fanPage.reload();
      await expect(
        fanPage.getByText("This event has been cancelled.", { exact: true }),
      ).toBeVisible();
      await neutralFanPage(fanPage);
      for (const managementPage of [page, adminPage]) {
        await managementPage.goto(`/venues/${slug}/workspace/billing`);
        await expect(
          managementPage.getByText(/This venue is private and editing is locked/),
        ).toBeVisible();
        await noOverflow(managementPage);
      }
      await webhook(recoveredFixture, 3);
      await page.reload();
      await expect(page.getByText("Venue is public", { exact: true })).toBeVisible();
      await fanPage.reload();
      await expect(
        fanPage.getByText("This event has been cancelled.", { exact: true }),
      ).toBeVisible();
      expect(
        rows<{ status: string }>(
          `select status from public.events where id=${sql(eventId)}::uuid;`,
        )[0].status,
      ).toBe("cancelled");

      await page.goto(`/venues/${slug}/workspace/settings`);
      const address = page.getByRole("textbox", { name: "Huddle page address" });
      await expect(page.getByText(/not your business website/)).toBeVisible();
      await address.fill("a".repeat(60));
      await expect(page.locator("#venue-settings-slug-preview code")).toHaveText(
        `/venues/${"a".repeat(60)}`,
      );
      await noOverflow(page);
      await address.fill(`${slug}-2`);
      await expect(page.getByRole("status").filter({ hasText: /already taken/ })).toBeVisible();
      const renamedSlug = `${slug}-renamed`;
      await address.fill(renamedSlug);
      await expect(
        page.getByRole("status").filter({ hasText: /available.*reserved/i }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Save venue", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/venues/${renamedSlug}/workspace/settings$`));
      slug = renamedSlug;
      await page.reload();
      await expect(address).toHaveValue(slug);
      await page.getByRole("button", { name: "Close venue", exact: true }).click();
      const closure = page.getByRole("alertdialog");
      await expect(closure).toContainText("does not cancel your demo subscription");
      await closure.getByRole("textbox", { name: "Venue name" }).fill(venueName);
      await closure.getByRole("button", { name: "Close venue permanently" }).click();
      await expect(page).toHaveURL(new RegExp(`/venues/${slug}/billing$`));
      await expect(page.getByRole("heading", { name: "Billing for a closed venue" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open billing portal" })).toBeVisible();
      await noOverflow(page);
      await adminPage.goto(`/venues/${slug}/billing`);
      await expect(
        adminPage.getByRole("heading", { name: "This page isn’t available." }),
      ).toBeVisible();
      await expect(adminPage.getByRole("button", { name: "Open billing portal" })).toHaveCount(0);
    } finally {
      for (const isolated of contexts) await isolated.close();
      expect(attempted, "No browser context may reach Polar").toEqual([]);
    }
  });
}
