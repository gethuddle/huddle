import { expect, test } from "@playwright/test";
import path from "node:path";

test("the tall desktop auth shell fills and centres the responsive viewport", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("link", { name: "Huddle home" })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rectangle = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`Missing layout element: ${selector}`);
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        centre: bounds.left + bounds.width / 2,
        boxShadow: getComputedStyle(element).boxShadow,
      };
    };

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      header: rectangle("header"),
      main: rectangle("main"),
      authCard: rectangle('[data-slot="card"]'),
    };
  });

  expect(metrics.viewportWidth).toBe(1364);
  expect(metrics.documentWidth).toBe(metrics.viewportWidth);
  expect(metrics.header.left).toBe(0);
  expect(metrics.header.width).toBe(metrics.viewportWidth);
  expect(metrics.main.left).toBeCloseTo(metrics.viewportWidth - metrics.main.right, 5);
  expect(metrics.authCard.centre).toBeCloseTo(metrics.viewportWidth / 2, 5);
  expect(metrics.authCard.boxShadow).not.toContain("rgba(11, 18, 16");
  expect(metrics.authCard.boxShadow).not.toMatch(/rgba\([^)]*,\s*0\.0?[1-9][^)]*\)/);

  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    path: path.join(process.cwd(), "docs", "evidence", "calm-explore", "sign-in-1364x1440.png"),
  });
});
