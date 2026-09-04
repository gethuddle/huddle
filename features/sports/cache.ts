export const SPORTS_CATALOG_CACHE_TAG = "sports-catalog";
export const SPORTS_CATALOG_REVALIDATE_SECONDS = 6 * 60 * 60;

export function sportsCatalogCacheTag(supabaseUrl: string) {
  return `${SPORTS_CATALOG_CACHE_TAG}:${new URL(supabaseUrl).host}`;
}
