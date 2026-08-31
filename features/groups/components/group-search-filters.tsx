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
      className="grid gap-4 rounded-[1.375rem] border border-border bg-card p-5 md:grid-cols-[1.4fr_1fr_auto] md:items-end"
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
          placeholder="Search groups"
          type="search"
        />
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
      <div className="flex gap-2">
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
