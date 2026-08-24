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

    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
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
});
