import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { prepareMapLibreAssets } from "./prepare-maplibre-assets.mjs";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

it("copies the installed worker, its exact sibling import and license into the matching version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "huddle-maplibre-assets-"));
  temporaryDirectories.push(directory);
  const packageDirectory = dirname(
    createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
  );
  const installed = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  const result = await prepareMapLibreAssets(directory);
  const destination = join(directory, "maplibre", installed.version);

  expect(result.workerUrl).toBe(`/maplibre/${installed.version}/maplibre-gl-worker.mjs`);
  expect(await readdir(destination)).toEqual([
    "LICENSE.txt",
    "maplibre-gl-shared.mjs",
    "maplibre-gl-worker.mjs",
  ]);
  for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    expect(await readFile(join(destination, name))).toEqual(
      await readFile(join(packageDirectory, "dist", name)),
    );
  }
  const worker = await readFile(join(destination, "maplibre-gl-worker.mjs"), "utf8");
  const dependencies = [...worker.matchAll(/from\s*["'](\.\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
  expect(dependencies).toEqual(["./maplibre-gl-shared.mjs"]);
  for (const dependency of dependencies) {
    expect((await readFile(join(destination, dependency))).length).toBeGreaterThan(0);
  }
  expect(await readFile(join(destination, "LICENSE.txt"))).toEqual(
    await readFile(join(packageDirectory, "LICENSE.txt")),
  );
  await prepareMapLibreAssets(directory);
  expect(await readdir(destination)).toHaveLength(3);
});
