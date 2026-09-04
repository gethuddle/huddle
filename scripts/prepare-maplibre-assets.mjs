import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Preserve the ESM worker's relative shared-module import and upstream license. */
export async function prepareMapLibreAssets(publicDirectory = resolve("public")) {
  const packageDirectory = dirname(
    createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
  );
  const { version } = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error("The installed MapLibre version is invalid.");
  }
  const destination = join(publicDirectory, "maplibre", version);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    ...["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"].map((name) =>
      copyFile(join(packageDirectory, "dist", name), join(destination, name)),
    ),
    copyFile(join(packageDirectory, "LICENSE.txt"), join(destination, "LICENSE.txt")),
  ]);
  return { workerUrl: `/maplibre/${version}/maplibre-gl-worker.mjs` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { workerUrl } = await prepareMapLibreAssets();
  console.log(`Prepared local MapLibre worker: ${workerUrl}`);
}
