import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DiscoveryCatalog } from "@/features/discovery/catalog";
import type { GroupSearchFilters } from "@/features/groups/search-schemas";

export function GroupSearchFilters({
  catalog,
  filters,
}: Readonly<{ catalog: DiscoveryCatalog; filters: GroupSearchFilters }>) {
  return (
    <form
      action="/groups"
      className="grid gap-4 rounded-[1.375rem] border border-border-dark bg-surface-raised p-5 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end"
      method="get"
    >
      <div>
        <Label htmlFor="group-search-query">Group name</Label>
        <Input
          className="mt-2 [&_select]:rounded-full"
          defaultValue={filters.query ?? ""}
          id="group-search-query"
          maxLength={80}
          minLength={2}
          name="q"
          placeholder="Search supporter groups"
          type="search"
        />
      </div>
      <div>
        <Label htmlFor="group-search-city">City</Label>
        <NativeSelect
          className="mt-2 [&_select]:rounded-full"
          defaultValue={filters.citySlug ?? ""}
          id="group-search-city"
          name="city"
        >
          <NativeSelectOption value="">All pilot cities</NativeSelectOption>
          {catalog.cities.map((city) => (
            <NativeSelectOption key={city.id} value={city.slug}>
              {city.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor="group-search-team">Team</Label>
        <NativeSelect
          className="mt-2"
          defaultValue={filters.teamId ?? ""}
          id="group-search-team"
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
      <div className="flex gap-2 md:col-span-2 lg:col-span-1">
        <Button className="flex-1 rounded-full lg:flex-none" type="submit">
          Search
        </Button>
        <Button asChild className="rounded-full" variant="ghost">
          <Link href="/groups">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
