/** Configure the local ESM worker before MapLibre constructs its shared worker pool. */
export async function loadMapLibreRuntime() {
  const maplibre = await import("maplibre-gl");
  // Next.js rewrites import.meta.url, so MapLibre cannot infer its worker URL.
  // The build/dev preparation copies this exact installed version and its sibling module.
  maplibre.setWorkerUrl(`/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`);
  return maplibre;
}
