import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CompetitionFilterOption, TeamFilterOption } from "@/features/sports/browse";
import type { FixtureFilters } from "@/features/sports/browse-schemas";

type FixtureFiltersProps = Readonly<{
  filters: FixtureFilters;
  competitions: readonly CompetitionFilterOption[];
  teams: readonly TeamFilterOption[];
}>;

export function FixtureFilters({ filters, competitions, teams }: FixtureFiltersProps) {
  return (
    <form
      action="/matches"
      className="grid gap-4 rounded-[1.375rem] border border-border-dark bg-surface-raised p-5 sm:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1fr_auto] lg:items-end"
      method="get"
    >
      <div>
        <Label htmlFor="fixture-date">Israel date</Label>
        <Input
          className="mt-2 rounded-full"
          defaultValue={filters.date}
          id="fixture-date"
          name="date"
          type="date"
        />
      </div>
      <div>
        <Label htmlFor="fixture-competition">Competition</Label>
        <NativeSelect
          className="mt-2 [&_select]:rounded-full"
          defaultValue={filters.competitionId ?? ""}
          id="fixture-competition"
          name="competition"
        >
          <NativeSelectOption value="">All competitions</NativeSelectOption>
          {competitions.map((competition) => (
            <NativeSelectOption key={competition.id} value={competition.id}>
              {competition.name}
              {competition.code === null ? "" : ` · ${competition.code}`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor="fixture-team">Team</Label>
        <NativeSelect
          className="mt-2 [&_select]:rounded-full"
          defaultValue={filters.teamId ?? ""}
          id="fixture-team"
          name="team"
        >
          <NativeSelectOption value="">All teams</NativeSelectOption>
          {teams.map((team) => (
            <NativeSelectOption key={team.id} value={team.id}>
              {team.shortName ?? team.name}
              {team.tla === null ? "" : ` · ${team.tla}`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <Button className="flex-1 rounded-full lg:flex-none" type="submit">
          Apply filters
        </Button>
        <Button asChild className="rounded-full" variant="ghost">
          <Link href="/matches">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
