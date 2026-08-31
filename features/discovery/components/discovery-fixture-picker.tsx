"use client";

import { CalendarDays, Search, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fixtureOptionPageSchema,
  type FixtureOption,
} from "@/features/sports/fixture-option-schemas";
import { formatIsraelKickoff } from "@/features/sports/time";

type Props = Readonly<{
  currentId: string | null;
  currentLabel: string | null;
  from: string;
  to: string;
}>;

export function DiscoveryFixturePicker({ currentId, currentLabel, from, to }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly FixtureOption[]>([]);
  const [selected, setSelected] = useState<Readonly<{ id: string; label: string }> | null>(
    currentId === null
      ? null
      : { id: currentId, label: currentLabel ?? "Previously selected fixture" },
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");

  async function searchFixtures() {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setStatus("empty");
      setResults([]);
      return;
    }

    setStatus("loading");
    try {
      const search = new URLSearchParams({ q: trimmedQuery, from, to });
      const response = await fetch(`/api/matches/options?${search.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Fixture search failed.");
      const page = fixtureOptionPageSchema.parse(await response.json());
      setResults(page.items);
      setStatus(page.items.length === 0 ? "empty" : "idle");
    } catch {
      setStatus("error");
      setResults([]);
    }
  }

  function chooseFixture(fixture: FixtureOption) {
    setSelected({ id: fixture.id, label: fixture.label });
    setResults([]);
    setStatus("idle");

    // An exact fixture replaces broader match filters so the submitted query cannot contradict
    // itself. These selects are uncontrolled because the browser submits the Explore form.
    const team = document.querySelector<HTMLSelectElement>("#discovery-team");
    const competition = document.querySelector<HTMLSelectElement>("#discovery-competition");
    if (team !== null) team.value = "";
    if (competition !== null) competition.value = "";
  }

  return (
    <div className="border-t border-border pt-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[15rem] flex-1">
          <Label htmlFor="discovery-fixture-search">Specific fixture (optional)</Label>
          <div className="relative mt-2">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="rounded-full pl-11"
              id="discovery-fixture-search"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void searchFixtures();
              }}
              placeholder="Search a team or matchup"
              type="search"
              value={query}
            />
          </div>
        </div>
        <Button
          disabled={status === "loading"}
          onClick={() => void searchFixtures()}
          type="button"
          variant="outline"
        >
          {status === "loading" ? "Searching…" : "Find fixtures"}
        </Button>
      </div>

      <input name="match" type="hidden" value={selected?.id ?? ""} />

      {selected === null ? null : (
        <div
          aria-label="Selected fixture"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Showing only</p>
            <p className="truncate font-semibold text-foreground">{selected.label}</p>
          </div>
          <Button
            aria-label="Clear fixture"
            onClick={() => setSelected(null)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      {status === "error" ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          We could not search fixtures. Your search is still here; try again.
        </p>
      ) : null}
      {status === "empty" ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {query.trim().length < 2
            ? "Type at least two characters to search fixtures."
            : "No fixtures match that search in this date range."}
        </p>
      ) : null}

      {results.length === 0 ? null : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {results.slice(0, 8).map((fixture) => (
            <li key={fixture.id}>
              <button
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                onClick={() => chooseFixture(fixture)}
                type="button"
              >
                <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-forest" />
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{fixture.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatIsraelKickoff(fixture.startsAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
