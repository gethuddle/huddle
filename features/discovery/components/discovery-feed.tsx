"use client";

import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import { LocateFixed, Map as MapIcon, MapPinOff, X } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoveryEventCard } from "@/features/discovery/components/discovery-event-card";
import { DiscoveryMap } from "@/features/discovery/components/discovery-map";
import {
  discoveryFilterIdentity,
  discoverySearchParams,
  type DiscoveryFilters,
} from "@/features/discovery/schemas";
import type { DiscoveryApiPage, DiscoveryPage } from "@/features/discovery/types";

type Coordinates = Readonly<{ lat: number; lng: number }>;
type LocationState = "city" | "locating" | "browser" | "denied";

async function fetchDiscoveryPage(
  filters: DiscoveryFilters,
  coordinates: Coordinates | null,
  cursor: string | null,
): Promise<DiscoveryApiPage> {
  const locatedFilters: DiscoveryFilters = {
    ...filters,
    lat: coordinates?.lat ?? null,
    lng: coordinates?.lng ?? null,
    cursor,
  };
  const response = await fetch(`/api/discovery?${discoverySearchParams(locatedFilters, cursor)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Discovery request failed.");
  return (await response.json()) as DiscoveryApiPage;
}

function DiscoveryFeedInner({
  filters,
  initialPage,
}: Readonly<{ filters: DiscoveryFilters; initialPage: DiscoveryPage }>) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("city");
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["event-discovery", discoveryFilterIdentity(filters), coordinates],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchDiscoveryPage(filters, coordinates, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData:
      coordinates === null
        ? {
            pages: [
              {
                items: initialPage.items,
                nextCursor: initialPage.nextCursor,
                locationMode: initialPage.locationMode,
                generatedAt: initialPage.generatedAt,
              },
            ],
            pageParams: [null],
          }
        : undefined,
    retry: 1,
    staleTime: 30_000,
  });

  function requestBrowserLocation() {
    if (!("geolocation" in navigator)) {
      setLocationState("denied");
      return;
    }

    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationState("browser");
      },
      () => {
        setCoordinates(null);
        setLocationState("denied");
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  }

  function useCityFallback() {
    setCoordinates(null);
    setLocationState("city");
  }

  const events = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-dark pb-5">
        <div>
          <p className="font-semibold text-linen">
            {locationState === "browser" ? "Using this browser location" : "Using city fallback"}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-dark">
            Current location is optional, used once, and never saved.
          </p>
        </div>
        {locationState === "browser" ? (
          <Button className="min-h-11" onClick={useCityFallback} type="button" variant="outline">
            <MapPinOff aria-hidden="true" />
            Use city instead
          </Button>
        ) : (
          <Button
            className="min-h-11"
            disabled={locationState === "locating"}
            onClick={requestBrowserLocation}
            type="button"
            variant="outline"
          >
            <LocateFixed aria-hidden="true" />
            {locationState === "locating" ? "Requesting location…" : "Use my location once"}
          </Button>
        )}
      </div>

      {locationState === "denied" ? (
        <p className="mt-3 text-sm text-sand" role="status">
          Location was unavailable or declined. Discovery is continuing from the selected city.
        </p>
      ) : null}

      {query.isPending ? (
        <div aria-busy="true" aria-label="Loading nearby events" className="mt-8 space-y-5">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-40 rounded-2xl" key={index} />
          ))}
        </div>
      ) : query.isError ? (
        <div className="mt-8 rounded-2xl border border-sand/30 bg-sand/10 p-6" role="alert">
          <p className="font-semibold text-linen">Discovery could not load.</p>
          <p className="mt-2 text-sm text-muted-dark">
            We could not refresh these opportunities. Try the search again.
          </p>
          <Button className="mt-4 min-h-11" onClick={() => void query.refetch()} type="button">
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(28rem,1.14fr)] xl:gap-10">
            <section aria-labelledby="discovery-results-heading" className="min-w-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-dark">
                    Explore
                  </p>
                  <h2
                    className="mt-2 text-2xl font-semibold text-linen"
                    id="discovery-results-heading"
                  >
                    {events.length} watch event{events.length === 1 ? "" : "s"} nearby
                  </h2>
                </div>
                <Button
                  className="min-h-11 rounded-full lg:hidden"
                  onClick={() => setMobileMapOpen(true)}
                  type="button"
                  variant="outline"
                >
                  <MapIcon aria-hidden="true" />
                  Show map
                </Button>
              </div>

              {events.length === 0 ? (
                <EmptyState
                  description="Try a wider radius, another date range, or fewer match filters. Existing plans are still available in their own workspace."
                  headingLevel="h3"
                  title="No new events match this search."
                />
              ) : (
                <div className="mt-6 space-y-5">
                  {events.map((event) => (
                    <DiscoveryEventCard event={event} key={event.id} />
                  ))}
                </div>
              )}

              <div className="mt-8 flex justify-center">
                {query.hasNextPage ? (
                  <Button
                    className="min-h-11"
                    disabled={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                    type="button"
                    variant="outline"
                  >
                    {query.isFetchingNextPage ? "Loading more…" : "Load more events"}
                  </Button>
                ) : events.length > 0 ? (
                  <p className="text-sm text-muted-dark">
                    That is every new opportunity in this search.
                  </p>
                ) : null}
              </div>
            </section>

            <aside
              aria-label="Desktop discovery map"
              className="sticky top-28 hidden min-w-0 lg:block"
            >
              <DiscoveryMap events={events} userLocation={coordinates} />
              <p className="mt-3 text-center text-xs leading-5 text-muted-dark">
                Pins are limited to public Venues and public places. Home locations never appear.
              </p>
            </aside>
          </div>

          {mobileMapOpen ? (
            <div
              aria-label="Map of nearby places"
              aria-modal="true"
              className="fixed inset-0 z-[70] overflow-y-auto bg-ink p-3 pb-24 lg:hidden"
              role="dialog"
            >
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-1 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-court">
                    Explore map
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-linen">
                    Places showing games nearby
                  </h2>
                </div>
                <Button
                  aria-label="Close map"
                  className="size-11 rounded-full p-0"
                  onClick={() => setMobileMapOpen(false)}
                  type="button"
                  variant="outline"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <div className="mx-auto mt-2 max-w-3xl">
                <DiscoveryMap events={events} userLocation={coordinates} />
                <p className="mt-3 px-2 text-center text-xs leading-5 text-muted-dark">
                  Only public Venues and public places are pinned. Your current location is used
                  once and is never saved.
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function DiscoveryFeed(
  props: Readonly<{ filters: DiscoveryFilters; initialPage: DiscoveryPage }>,
) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <DiscoveryFeedInner {...props} />
    </QueryClientProvider>
  );
}
