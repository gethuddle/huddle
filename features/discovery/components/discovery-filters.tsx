"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DiscoveryCatalog } from "@/features/discovery/catalog";
import { DISCOVERY_RADIUS_OPTIONS, type DiscoveryFilters } from "@/features/discovery/schemas";

export function DiscoveryFiltersForm({
  catalog,
  filters,
}: Readonly<{ catalog: DiscoveryCatalog; filters: DiscoveryFilters }>) {
  const cityName =
    catalog.cities.find((city) => city.slug === filters.citySlug)?.name ?? filters.citySlug;
  const competitionName =
    catalog.competitions.find((competition) => competition.id === filters.competitionId)?.name ??
    null;
  const team = catalog.teams.find((candidate) => candidate.id === filters.teamId);
  const matchSummary =
    team?.shortName ??
    team?.name ??
    competitionName ??
    (filters.matchId === null ? "Any match" : "Selected fixture");

  return (
    <div className="mx-auto max-w-4xl">
      <Dialog>
        <DialogTrigger asChild>
          <button
            aria-label="Change Explore search"
            className="group flex min-h-16 w-full items-center rounded-full border border-border-strong bg-surface-raised p-2 text-left shadow-[0_14px_32px_rgba(0,0,0,0.22)] outline-none transition hover:border-muted-dark focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[4.5rem]"
            type="button"
          >
            <Search aria-hidden="true" className="ml-3 size-5 shrink-0 text-linen sm:hidden" />
            <span className="min-w-0 flex-1 px-3 sm:grid sm:grid-cols-3 sm:px-0">
              <SearchSegment label="Where" value={cityName} />
              <SearchSegment bordered label="When" value={dateSummary(filters.from, filters.to)} />
              <SearchSegment label="Match" value={matchSummary} />
              <span className="mt-0.5 block truncate text-xs text-muted-dark sm:hidden">
                {dateSummary(filters.from, filters.to)} · {matchSummary}
              </span>
            </span>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-court text-ink transition group-hover:bg-court-hover sm:size-13">
              <SlidersHorizontal aria-hidden="true" className="size-5" />
            </span>
          </button>
        </DialogTrigger>

        <DialogContent className="max-w-4xl p-0">
          <form action="/discover" method="get">
            <div className="p-6 sm:p-8">
              <DialogHeader>
                <DialogTitle>Change Explore search</DialogTitle>
                <DialogDescription>
                  Choose an area and date range, then narrow the map to a competition or team if you
                  want.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-7 grid gap-7 lg:grid-cols-3">
                <fieldset className="border-0 p-0">
                  <legend className="px-1 text-sm font-semibold text-linen">Where</legend>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <Label htmlFor="discovery-city">City</Label>
                      <NativeSelect
                        className="mt-2 [&_select]:rounded-full"
                        defaultValue={filters.citySlug}
                        id="discovery-city"
                        name="city"
                      >
                        {catalog.cities.map((city) => (
                          <NativeSelectOption key={city.id} value={city.slug}>
                            {city.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label htmlFor="discovery-radius">Distance</Label>
                      <NativeSelect
                        className="mt-2 [&_select]:rounded-full"
                        defaultValue={String(filters.radiusKm)}
                        id="discovery-radius"
                        name="radiusKm"
                      >
                        {DISCOVERY_RADIUS_OPTIONS.map((radius) => (
                          <NativeSelectOption key={radius} value={String(radius)}>
                            Within {radius} km
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="border-0 p-0">
                  <legend className="px-1 text-sm font-semibold text-linen">When</legend>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <Label htmlFor="discovery-from">From</Label>
                      <Input
                        className="mt-2 rounded-full"
                        defaultValue={filters.from}
                        id="discovery-from"
                        name="from"
                        type="date"
                      />
                    </div>
                    <div>
                      <Label htmlFor="discovery-to">To</Label>
                      <Input
                        className="mt-2 rounded-full"
                        defaultValue={filters.to}
                        id="discovery-to"
                        name="to"
                        type="date"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="border-0 p-0">
                  <legend className="px-1 text-sm font-semibold text-linen">Match</legend>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <Label htmlFor="discovery-competition">Competition</Label>
                      <NativeSelect
                        className="mt-2 [&_select]:rounded-full"
                        defaultValue={filters.competitionId ?? ""}
                        id="discovery-competition"
                        name="competition"
                      >
                        <NativeSelectOption value="">All competitions</NativeSelectOption>
                        {catalog.competitions.map((competition) => (
                          <NativeSelectOption key={competition.id} value={competition.id}>
                            {competition.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label htmlFor="discovery-team">Team</Label>
                      <NativeSelect
                        className="mt-2 [&_select]:rounded-full"
                        defaultValue={filters.teamId ?? ""}
                        id="discovery-team"
                        name="team"
                      >
                        <NativeSelectOption value="">All teams</NativeSelectOption>
                        {catalog.teams.map((candidate) => (
                          <NativeSelectOption key={candidate.id} value={candidate.id}>
                            {candidate.shortName ?? candidate.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                </fieldset>
              </div>

              {filters.matchId === null ? null : (
                <input name="match" type="hidden" value={filters.matchId} />
              )}
            </div>

            <DialogFooter className="border-t border-border-dark px-6 py-5 sm:px-8">
              <Button asChild className="min-h-11 rounded-full" variant="ghost">
                <Link href={`/discover?city=${filters.citySlug}`}>Clear</Link>
              </Button>
              <Button className="min-h-11 rounded-full" type="submit">
                Show events
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SearchSegment({
  bordered = false,
  label,
  value,
}: Readonly<{ bordered?: boolean; label: string; value: string }>) {
  return (
    <span
      className={`hidden min-w-0 px-6 sm:block ${bordered ? "border-x border-border-dark" : ""}`}
    >
      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-dark">
        {label}
      </span>
      <span className="mt-1 block truncate font-semibold text-linen">{value}</span>
    </span>
  );
}

function dateSummary(from: string, to: string) {
  const format = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  return `${format.format(new Date(`${from}T12:00:00Z`))}–${format.format(new Date(`${to}T12:00:00Z`))}`;
}
