"use client";

import { QueryClientProvider, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, Map as MapIcon, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoveryEventCard } from "@/features/discovery/components/discovery-event-card";
import { DiscoveryMap } from "@/features/discovery/components/discovery-map";
import {
  discoveryFilterIdentity,
  discoverySearchParams,
  type DiscoveryFilters,
} from "@/features/discovery/schemas";
import { TeamMark } from "@/features/sports/components/team-initials";
import { formatIsraelKickoff } from "@/features/sports/time";
import { AddressSearch } from "@/features/locations/components/address-search";
import type { AddressSuggestion } from "@/features/locations/types";
import type { DiscoveryApiPage, DiscoveryEvent, DiscoveryPage } from "@/features/discovery/types";
import { getDiscoveryQueryClient } from "@/features/discovery/query-client";
import {
  parseSessionOrigin,
  readSessionOrigin,
  writeSessionOrigin,
} from "@/features/discovery/session-origin";

type Coordinates = Readonly<{ lat: number; lng: number }>;
type LocationState = "idle" | "locating" | "browser" | "address" | "denied";

function discoveryQueryKey(
  viewerCacheScope: string,
  filters: DiscoveryFilters,
  coordinates: Coordinates | null,
) {
  return [
    "event-discovery",
    viewerCacheScope,
    discoveryFilterIdentity(filters),
    filters.limit,
    coordinates,
  ] as const;
}

function useDesktopViewport() {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const media = window.matchMedia("(min-width: 1024px)");
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)").matches
        : false,
    () => false,
  );
}

function groupEventsByMatch(events: readonly DiscoveryEvent[]) {
  const groups = new Map<string, DiscoveryEvent[]>();
  for (const event of events) {
    const group = groups.get(event.match.id);
    if (group === undefined) groups.set(event.match.id, [event]);
    else group.push(event);
  }
  return [...groups.values()];
}

async function fetchDiscoveryPage(
  filters: DiscoveryFilters,
  coordinates: Coordinates | null,
  cursor: string | null,
): Promise<DiscoveryApiPage> {
  const body: Record<string, string | number> = Object.fromEntries(
    discoverySearchParams(filters, cursor),
  );
  if (coordinates !== null) {
    body.lat = coordinates.lat;
    body.lng = coordinates.lng;
  }
  const response = await fetch("/api/discovery", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Discovery request failed.");
  return (await response.json()) as DiscoveryApiPage;
}

function DiscoveryFeedInner({
  filters,
  initialPage,
}: Readonly<{ filters: DiscoveryFilters; initialPage: DiscoveryPage }>) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [locationLabel, setLocationLabel] = useState("");
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const isDesktop = useDesktopViewport();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: discoveryQueryKey(initialPage.viewerCacheScope, filters, coordinates),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchDiscoveryPage(filters, coordinates, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: coordinates !== null,
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
    // Reuse cached results immediately after tab navigation, then reconcile
    // attendance, event, and entitlement changes in the background.
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    staleTime: 30_000,
  });

  useEffect(() => {
    const stored = readSessionOrigin(window.sessionStorage);
    if (stored !== null) {
      const restoreTimer = window.setTimeout(() => {
        const restoredCoordinates = { lat: stored.lat, lng: stored.lng };
        void queryClient.invalidateQueries({
          queryKey: discoveryQueryKey(initialPage.viewerCacheScope, filters, restoredCoordinates),
          refetchType: "none",
        });
        setCoordinates(restoredCoordinates);
        setLocationLabel(stored.label);
        setLocationState(stored.kind);
      }, 0);
      return () => window.clearTimeout(restoreTimer);
    }

    if ("geolocation" in navigator) requestBrowserLocation();
    // This is an intentional one-time restore/permission check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rememberOrigin(next: Coordinates, label: string, kind: "browser" | "address") {
    const origin = parseSessionOrigin({ ...next, label, kind });
    if (origin === null) {
      setCoordinates(null);
      setLocationLabel("");
      setLocationState("denied");
      return;
    }
    setCoordinates({ lat: origin.lat, lng: origin.lng });
    setLocationLabel(origin.label);
    setLocationState(origin.kind);
    writeSessionOrigin(window.sessionStorage, origin);
  }

  function requestBrowserLocation() {
    if (!("geolocation" in navigator)) {
      setLocationState("denied");
      return;
    }

    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        rememberOrigin(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          "Current location",
          "browser",
        );
      },
      () => {
        setCoordinates(null);
        setLocationState("denied");
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function useAddressOrigin(suggestion: AddressSuggestion | null) {
    if (suggestion === null) return;
    rememberOrigin(
      { lat: suggestion.latitude, lng: suggestion.longitude },
      suggestion.label,
      "address",
    );
  }

  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  const eventGroups = groupEventsByMatch(events);
  const returnTo = `/discover?${discoverySearchParams(filters, null).toString()}`;
  const canSearchAddress = initialPage.viewerCacheScope.startsWith("fan:");

  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-semibold text-foreground">
            {locationState === "browser"
              ? "Using this browser location"
              : locationState === "address"
                ? `Near ${locationLabel}`
                : locationState === "locating"
                  ? "Finding events near you…"
                  : "Choose where to explore"}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Distance is calculated from this origin. Exact coordinates stay out of links and logs.
          </p>
        </div>
        <Button
          className="min-h-11"
          disabled={locationState === "locating"}
          onClick={requestBrowserLocation}
          type="button"
          variant="outline"
        >
          <LocateFixed aria-hidden="true" />
          {locationState === "locating" ? "Requesting location…" : "Use my current location"}
        </Button>
      </div>

      {locationState === "denied" ? (
        <p className="mt-3 text-sm text-foreground" role="status">
          Location was unavailable or declined. Search an address or area below to explore.
        </p>
      ) : null}

      <details className="mt-4 rounded-2xl border border-border bg-card px-5 py-4">
        <summary className="cursor-pointer font-semibold text-foreground">
          Search an area or address
        </summary>
        <div className="mt-5 border-t border-border pt-5">
          {canSearchAddress ? (
            <AddressSearch
              authRecoveryHref={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`}
              onConfirm={useAddressOrigin}
              purpose="origin"
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Sign in before searching an area or address. This keeps location requests tied to an
                eligible account.
              </p>
              <Button asChild>
                <Link href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`}>
                  Sign in to search
                </Link>
              </Button>
            </div>
          )}
        </div>
      </details>

      {query.isPending ? (
        <div aria-busy="true" aria-label="Loading nearby events" className="mt-8 space-y-5">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-40 rounded-2xl" key={index} />
          ))}
        </div>
      ) : query.isError && query.data === undefined ? (
        <div className="mt-8 rounded-2xl border border-sand/30 bg-sand/10 p-6" role="alert">
          <p className="font-semibold text-foreground">Discovery could not load.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We could not refresh these opportunities. Try the search again.
          </p>
          <Button className="mt-4 min-h-11" onClick={() => void query.refetch()} type="button">
            Retry
          </Button>
        </div>
      ) : (
        <>
          {query.isRefetchError ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Couldn’t refresh events. Showing recent results.
            </p>
          ) : null}
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(28rem,1.14fr)] xl:gap-10">
            <section aria-labelledby="discovery-results-heading" className="min-w-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Explore</p>
                  <h2
                    className="mt-2 text-2xl font-semibold text-foreground"
                    id="discovery-results-heading"
                  >
                    {events.length} watch event{events.length === 1 ? "" : "s"} nearby
                  </h2>
                </div>
                <Dialog onOpenChange={setMobileMapOpen} open={mobileMapOpen && !isDesktop}>
                  <DialogTrigger asChild>
                    <Button
                      className="min-h-11 rounded-full lg:hidden"
                      type="button"
                      variant="outline"
                    >
                      <MapIcon aria-hidden="true" />
                      Show map
                    </Button>
                  </DialogTrigger>
                  {!isDesktop ? (
                    <DialogContent className="top-0 left-0 z-[70] h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-3 pb-24">
                      <DialogTitle className="sr-only">Map of nearby places</DialogTitle>
                      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-1 py-3">
                        <div>
                          <p className="text-sm font-medium text-forest">Explore map</p>
                          <h2 className="mt-1 text-xl font-semibold text-foreground">
                            Places showing games nearby
                          </h2>
                        </div>
                        <DialogClose asChild>
                          <Button
                            aria-label="Close map"
                            className="size-11 rounded-full p-0"
                            type="button"
                            variant="outline"
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </DialogClose>
                      </div>
                      <div className="mx-auto mt-2 w-full max-w-3xl">
                        <DiscoveryMap events={events} userLocation={coordinates} />
                        <DialogDescription className="mt-3 px-2 text-center text-xs leading-5">
                          Only public Venues and public places are pinned. Your current location is
                          used once and is never saved.
                        </DialogDescription>
                      </div>
                    </DialogContent>
                  ) : null}
                </Dialog>
              </div>

              {events.length === 0 ? (
                <EmptyState
                  description="Try a wider radius, another date range, or fewer match filters. Existing plans are still available in their own workspace."
                  headingLevel="h3"
                  title="No new events match this search."
                />
              ) : (
                <div className="mt-6 space-y-8">
                  {eventGroups.map((group) => {
                    const match = group[0]!.match;
                    const headingId = `discovery-match-${match.id}`;
                    return (
                      <section aria-labelledby={headingId} key={match.id}>
                        <div className="flex items-center gap-4 rounded-2xl bg-muted px-4 py-4 sm:px-5">
                          <TeamMark
                            crestUrl={match.homeTeamCrestUrl}
                            name={match.homeTeamName}
                            size="md"
                            tla={match.homeTeamTla}
                          />
                          <span className="text-xs font-semibold text-muted-foreground">vs</span>
                          <TeamMark
                            crestUrl={match.awayTeamCrestUrl}
                            name={match.awayTeamName}
                            size="md"
                            tla={match.awayTeamTla}
                          />
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground" id={headingId}>
                              {match.homeTeamName} vs {match.awayTeamName}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {match.competitionName} · {formatIsraelKickoff(group[0]!.startsAt)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-3">
                          {group.map((event) => (
                            <DiscoveryEventCard event={event} key={event.id} returnTo={returnTo} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
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
                  <p className="text-sm text-muted-foreground">
                    That is every new opportunity in this search.
                  </p>
                ) : null}
              </div>
            </section>

            {isDesktop ? (
              <aside aria-label="Desktop discovery map" className="sticky top-28 min-w-0">
                <DiscoveryMap events={events} userLocation={coordinates} />
                <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                  Pins are limited to public Venues and public places. Home locations never appear.
                </p>
              </aside>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function DiscoveryFeed(
  props: Readonly<{
    filters: DiscoveryFilters;
    initialPage: DiscoveryPage;
  }>,
) {
  const [queryClient] = useState(getDiscoveryQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <DiscoveryFeedInner initialPage={props.initialPage} filters={props.filters} />
    </QueryClientProvider>
  );
}
