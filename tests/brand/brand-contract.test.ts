import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const palette = {
  ink: "#0b1210",
  court: "#2ce07b",
  "court-hover": "#6ff0a6",
  forest: "#0f7a42",
  linen: "#f2eee4",
  sand: "#c9b48f",
  "muted-dark": "#8a948e",
  "muted-light": "#5c665f",
  "border-dark": "#232b27",
  "border-strong": "#2a332e",
  "surface-raised": "#151d18",
  "surface-deep": "#0e1512",
} as const;

const brandAssets = [
  "huddle-app-icon.svg",
  "huddle-favicon.svg",
  "huddle-github-avatar.svg",
  "huddle-lockup-dark.svg",
  "huddle-lockup-light.svg",
  "huddle-mark-forest.svg",
  "huddle-mark-green.svg",
  "huddle-mark-ink.svg",
  "huddle-mark-linen.svg",
  "huddle-social-banner.svg",
] as const;

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTsxFiles(path);
    }

    return entry.isFile() && path.endsWith(".tsx") && !path.endsWith(".test.tsx") ? [path] : [];
  });
}

describe("brand contract", () => {
  it("exports every approved swatch through Tailwind", () => {
    const globalStyles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    for (const [name, value] of Object.entries(palette)) {
      expect(globalStyles).toContain(`--color-${name}: ${value};`);
    }
  });

  it("keeps the approved vector suite available to application consumers", () => {
    for (const asset of brandAssets) {
      expect(existsSync(join(process.cwd(), "public/brand", asset))).toBe(true);
    }
  });

  it("keeps raw brand colors out of application components", () => {
    const files = [
      ...collectTsxFiles(join(process.cwd(), "app")),
      ...collectTsxFiles(join(process.cwd(), "components")),
    ];
    const offenders = files.filter((file) => /#[\da-f]{3,8}/i.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("keeps the shared product geometry and readable body baseline in primitives", () => {
    const globalStyles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const button = readFileSync(join(process.cwd(), "components/ui/button.tsx"), "utf8");
    const card = readFileSync(join(process.cwd(), "components/ui/card.tsx"), "utf8");
    const input = readFileSync(join(process.cwd(), "components/ui/input.tsx"), "utf8");
    const nativeSelect = readFileSync(
      join(process.cwd(), "components/ui/native-select.tsx"),
      "utf8",
    );

    expect(globalStyles).toContain("font-size: 1rem;");
    expect(button).toContain('default: "min-h-11');
    expect(button).toContain('icon: "size-11"');
    expect(card).toContain("rounded-[1.375rem]");
    expect(card).not.toContain("shadow-xl");
    expect(input).toContain("rounded-[0.875rem]");
    expect(nativeSelect).toContain("rounded-[0.875rem]");
  });

  it("uses border-led surfaces and pale semantic elevation instead of dark stock shadows", () => {
    const globalStyles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const elevatedSources = [
      "components/ui/card.tsx",
      "components/ui/button.tsx",
      "components/ui/dropdown-menu.tsx",
      "components/ui/dialog.tsx",
      "components/ui/alert-dialog.tsx",
      "components/ui/combobox.tsx",
      "features/discovery/components/discovery-filters.tsx",
      "features/workspaces/components/fan-bottom-navigation.tsx",
      "features/workspaces/components/venue-workspace-header.tsx",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8"));

    expect(globalStyles).toContain("--shadow-floating:");
    expect(globalStyles).toContain("--shadow-search:");
    expect(globalStyles).toContain("--shadow-docked:");
    for (const source of elevatedSources) {
      expect(source).not.toMatch(/shadow-(?:sm|md|lg|xl|2xl)/);
      expect(source).not.toContain("rgba(11,18,16");
    }
  });

  it("keeps current navigation semantic and visibly selected", () => {
    const siteHeader = readFileSync(
      join(process.cwd(), "components/layout/site-header.tsx"),
      "utf8",
    );
    const fanNavigation = readFileSync(
      join(process.cwd(), "features/workspaces/components/fan-bottom-navigation.tsx"),
      "utf8",
    );

    for (const source of [siteHeader, fanNavigation]) {
      expect(source).toContain('aria-current={current ? "page" : undefined}');
      expect(source).toMatch(/current\s*&&\s*["']/);
    }
  });

  it("keeps implementation and course vocabulary out of rendered product sources", () => {
    const files = [
      ...collectTsxFiles(join(process.cwd(), "app")),
      ...collectTsxFiles(join(process.cwd(), "components")),
      ...collectTsxFiles(join(process.cwd(), "features")),
    ];
    const forbidden =
      /course MVP|submitted MVP|\bB(?:0[1-9]|1[0-5])\b|provider-neutral identities|raw payloads|lifecycle synchronized|Current lifecycle/i;
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
