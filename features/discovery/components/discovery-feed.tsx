"use client";

import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import { LocateFixed, MapPinOff } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoveryEventCard } from "@/features/discovery/components/discovery-event-card";
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
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-dark bg-surface-deep p-5">
        <div>
          <p className="font-semibold text-linen">
            {locationState === "browser" ? "Using this browser location" : "Using city fallback"}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-dark">
            Your browser coordinate is sent only with this search. Huddle does not save it or add it
            to the page URL.
          </p>
        </div>
        {locationState === "browser" ? (
          <Button onClick={useCityFallback} type="button" variant="outline">
            <MapPinOff aria-hidden="true" />
            Use city instead
          </Button>
        ) : (
          <Button
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
        <div
          aria-busy="true"
          aria-label="Loading nearby events"
          className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-96 rounded-2xl" key={index} />
          ))}
        </div>
      ) : query.isError ? (
        <div className="mt-8 rounded-2xl border border-sand/30 bg-sand/10 p-6" role="alert">
          <p className="font-semibold text-linen">Discovery could not load.</p>
          <p className="mt-2 text-sm text-muted-dark">
            The last good sports catalog is still safe. Try this request again.
          </p>
          <Button className="mt-4" onClick={() => void query.refetch()} type="button">
            Retry
          </Button>
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          description="Try a wider radius, another date range, or fewer team and competition filters. Private events appear only when you are currently eligible to see them."
          headingLevel="h2"
          title="No eligible events match this search."
        />
      ) : (
        <>
          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-dark">
                Eligible nearby events
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-linen">Where supporters gather</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <DiscoveryEventCard event={event} key={event.id} />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            {query.hasNextPage ? (
              <Button
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                type="button"
                variant="outline"
              >
                {query.isFetchingNextPage ? "Loading more…" : "Load more events"}
              </Button>
            ) : (
              <p className="text-sm text-muted-dark">You reached the end of eligible events.</p>
            )}
          </div>
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
