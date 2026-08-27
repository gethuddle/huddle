import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DiscoveryCatalog } from "@/features/discovery/catalog";
import { DISCOVERY_RADIUS_OPTIONS, type DiscoveryFilters } from "@/features/discovery/schemas";

export function DiscoveryFiltersForm({
  catalog,
  filters,
}: Readonly<{ catalog: DiscoveryCatalog; filters: DiscoveryFilters }>) {
  return (
    <form
      action="/discover"
      className="grid gap-4 rounded-2xl border border-border-dark bg-surface-raised p-5 md:grid-cols-2 xl:grid-cols-[1fr_0.7fr_1fr_1fr_1fr_1fr_auto] xl:items-end"
      method="get"
    >
      <div>
        <Label htmlFor="discovery-city">City fallback</Label>
        <NativeSelect
          className="mt-2"
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
        <Label htmlFor="discovery-radius">Radius</Label>
        <NativeSelect
          className="mt-2"
          defaultValue={String(filters.radiusKm)}
          id="discovery-radius"
          name="radiusKm"
        >
          {DISCOVERY_RADIUS_OPTIONS.map((radius) => (
            <NativeSelectOption key={radius} value={String(radius)}>
              {radius} km
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor="discovery-from">From</Label>
        <Input
          className="mt-2"
          defaultValue={filters.from}
          id="discovery-from"
          name="from"
          type="date"
        />
      </div>
      <div>
        <Label htmlFor="discovery-to">To</Label>
        <Input className="mt-2" defaultValue={filters.to} id="discovery-to" name="to" type="date" />
      </div>
      <div>
        <Label htmlFor="discovery-competition">Competition</Label>
        <NativeSelect
          className="mt-2"
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
          className="mt-2"
          defaultValue={filters.teamId ?? ""}
          id="discovery-team"
          name="team"
        >
          <NativeSelectOption value="">All teams</NativeSelectOption>
          {catalog.teams.map((team) => (
            <NativeSelectOption key={team.id} value={team.id}>
              {team.shortName ?? team.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {filters.matchId === null ? null : (
        <input name="match" type="hidden" value={filters.matchId} />
      )}
      <div className="flex gap-2 md:col-span-2 xl:col-span-1">
        <Button className="flex-1 xl:flex-none" type="submit">
          Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/discover?city=${filters.citySlug}`}>Clear</Link>
        </Button>
      </div>
    </form>
  );
}
