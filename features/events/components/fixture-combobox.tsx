"use client";

import { CalendarDays, Check, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  fixtureOptionPageSchema,
  type FixtureOption,
} from "@/features/sports/fixture-option-schemas";
import { formatIsraelKickoff } from "@/features/sports/time";

type FixtureChoice = FixtureOption & Readonly<{ followed?: boolean }>;

type FixtureComboboxProps = Readonly<{
  matches: readonly FixtureChoice[];
  value: string;
  onValueChange: (match: FixtureOption) => void;
  initialHasMore?: boolean;
  excludeValues?: readonly string[];
  selectedValues?: readonly string[];
  selectionLabels?: Readonly<Record<string, string>>;
  onValueRemove?: (matchId: string) => void;
}>;

type DatePreset = "any" | "weekend" | "next-seven";

const INITIAL_VISIBLE = 8;

function israelDayLabel(value: string) {
  return new Intl.DateTimeFormat("en-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function israelDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function todayInIsrael() {
  return israelDate(new Date().toISOString());
}

function addCalendarDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function presetRange(preset: DatePreset): Readonly<{ from: string; to: string }> | null {
  const today = todayInIsrael();
  if (preset === "any") return null;
  if (preset === "next-seven") return { from: today, to: addCalendarDays(today, 6) };

  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysUntilFriday = (5 - weekday + 7) % 7;
  const friday = addCalendarDays(today, daysUntilFriday);
  return { from: friday, to: addCalendarDays(friday, 2) };
}

function matchCompetition(match: FixtureChoice) {
  if (match.competitionName !== undefined) return match.competitionName;
  return match.label.split(" — ").at(-1) ?? "Other competition";
}

function matchSportSlug(match: FixtureChoice) {
  return match.sportSlug ?? "football";
}

function matchSportName(match: FixtureChoice) {
  return match.sportName ?? "Football";
}

export function FixtureCombobox({
  excludeValues = [],
  initialHasMore = false,
  matches,
  onValueChange,
  onValueRemove,
  selectedValues,
  selectionLabels = {},
  value,
}: FixtureComboboxProps) {
  const [query, setQuery] = useState("");
  const [fixtureDate, setFixtureDate] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("next-seven");
  const [sport, setSport] = useState("");
  const [competition, setCompetition] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<readonly FixtureChoice[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [filtersTouched, setFiltersTouched] = useState(false);
  const excluded = useMemo(() => new Set(excludeValues), [excludeValues]);
  const selected = useMemo(
    () => new Set(selectedValues ?? (value === "" ? [] : [value])),
    [selectedValues, value],
  );
  const allMatches = useMemo(() => {
    const merged = new Map(matches.map((match) => [match.id, match]));
    for (const match of remoteMatches) merged.set(match.id, match);
    return [...merged.values()];
  }, [matches, remoteMatches]);
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const range = useMemo(() => presetRange(datePreset), [datePreset]);
  const sports = useMemo(() => {
    const choices = new Map<string, string>();
    for (const match of allMatches) choices.set(matchSportSlug(match), matchSportName(match));
    return [...choices.entries()].sort((first, second) => first[1].localeCompare(second[1]));
  }, [allMatches]);
  const competitions = useMemo(
    () =>
      [...new Set(allMatches.map(matchCompetition))].sort((first, second) =>
        first.localeCompare(second),
      ),
    [allMatches],
  );
  const matching = useMemo(
    () =>
      allMatches
        .filter((match) => {
          if (selected.has(match.id)) return onValueRemove === undefined;
          if (excluded.has(match.id)) return false;
          if (
            normalizedQuery !== "" &&
            !match.label.toLocaleLowerCase("en-US").includes(normalizedQuery)
          ) {
            return false;
          }
          const date = israelDate(match.startsAt);
          if (fixtureDate !== "" && date !== fixtureDate) return false;
          if (fixtureDate === "" && range !== null && (date < range.from || date > range.to)) {
            return false;
          }
          if (sport !== "" && matchSportSlug(match) !== sport) return false;
          if (competition !== "" && matchCompetition(match) !== competition) return false;
          return true;
        })
        .sort(
          (first, second) =>
            Number(Boolean(second.followed)) - Number(Boolean(first.followed)) ||
            first.startsAt.localeCompare(second.startsAt) ||
            first.id.localeCompare(second.id),
        ),
    [
      allMatches,
      competition,
      excluded,
      fixtureDate,
      normalizedQuery,
      onValueRemove,
      range,
      selected,
      sport,
    ],
  );
  const visible = matching.slice(0, visibleCount);
  const grouped = useMemo(() => {
    const groups = new Map<string, FixtureChoice[]>();
    for (const match of visible) {
      const label = israelDayLabel(match.startsAt);
      groups.set(label, [...(groups.get(label) ?? []), match]);
    }
    return [...groups.entries()];
  }, [visible]);

  const loadPage = useCallback(
    async (requestedPage: number, append: boolean, signal?: AbortSignal) => {
      const search = new URLSearchParams();
      if (query.trim() !== "") search.set("q", query.trim());
      if (fixtureDate !== "") {
        search.set("date", fixtureDate);
      } else if (range !== null) {
        search.set("from", range.from);
        search.set("to", range.to);
      }
      if (sport !== "") search.set("sport", sport);
      if (competition !== "") search.set("competition", competition);
      if (requestedPage > 1) search.set("page", String(requestedPage));
      setLoading(true);
      setSearchError(false);
      try {
        const response = await fetch(`/api/matches/options?${search.toString()}`, { signal });
        if (!response.ok) throw new Error("Fixture search failed.");
        const result = fixtureOptionPageSchema.parse(await response.json());
        setRemoteMatches((current) => (append ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchError(true);
      } finally {
        if (signal?.aborted !== true) setLoading(false);
      }
    },
    [competition, fixtureDate, query, range, sport],
  );

  function resetRemoteSearch() {
    setRemoteMatches([]);
    setPage(1);
    setHasMore(initialHasMore);
    setVisibleCount(INITIAL_VISIBLE);
    setLoading(false);
    setSearchError(false);
    setFiltersTouched(true);
  }

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    if (nextQuery.trim() !== "" && fixtureDate === "") setDatePreset("any");
    resetRemoteSearch();
  }

  function choosePreset(nextPreset: DatePreset) {
    setFixtureDate("");
    setDatePreset(nextPreset);
    resetRemoteSearch();
  }

  async function showMoreFixtures() {
    if (visibleCount < matching.length) {
      setVisibleCount((count) => count + INITIAL_VISIBLE);
      return;
    }
    if (!hasMore) return;
    await loadPage(page + 1, true);
    setVisibleCount((count) => count + INITIAL_VISIBLE);
  }

  useEffect(() => {
    if (!filtersTouched) return;
    if (query.trim().length === 1) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadPage(1, false, controller.signal), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filtersTouched, loadPage, query]);

  return (
    <section aria-label="Fixture picker" className="space-y-5">
      <div className="rounded-[1.5rem] border border-border-dark bg-surface-raised p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1.5fr)_minmax(10rem,0.8fr)_minmax(9rem,0.7fr)_minmax(11rem,0.9fr)]">
          <div>
            <Label htmlFor="fixture-search">Search fixtures</Label>
            <div className="relative mt-2">
              <Search
                aria-hidden="true"
                className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-dark"
              />
              <Input
                className="rounded-full pl-11"
                id="fixture-search"
                onChange={(event) => updateQuery(event.currentTarget.value)}
                placeholder="Team or competition"
                type="search"
                value={query}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="fixture-date">Fixture date</Label>
            <div className="relative mt-2">
              <CalendarDays
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-dark"
              />
              <Input
                className="rounded-full pl-11"
                id="fixture-date"
                onChange={(event) => {
                  setFixtureDate(event.currentTarget.value);
                  setDatePreset("any");
                  resetRemoteSearch();
                }}
                type="date"
                value={fixtureDate}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="fixture-sport">Sport</Label>
            <NativeSelect
              className="mt-2 rounded-full"
              id="fixture-sport"
              onChange={(event) => {
                setSport(event.currentTarget.value);
                resetRemoteSearch();
              }}
              value={sport}
            >
              <NativeSelectOption value="">All sports</NativeSelectOption>
              {sports.map(([slug, name]) => (
                <NativeSelectOption key={slug} value={slug}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="fixture-competition">Competition</Label>
            <NativeSelect
              className="mt-2 rounded-full"
              id="fixture-competition"
              onChange={(event) => {
                setCompetition(event.currentTarget.value);
                resetRemoteSearch();
              }}
              value={competition}
            >
              <NativeSelectOption value="">All competitions</NativeSelectOption>
              {competitions.map((name) => (
                <NativeSelectOption key={name} value={name}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(
            [
              ["any", "Any date"],
              ["weekend", "This weekend"],
              ["next-seven", "Next 7 days"],
            ] as const
          ).map(([preset, label]) => (
            <button
              aria-pressed={fixtureDate === "" && datePreset === preset}
              className="rounded-full border border-border-dark px-4 py-2 text-sm font-semibold text-muted-dark transition hover:border-border-strong hover:text-linen aria-pressed:border-linen aria-pressed:bg-linen aria-pressed:text-ink"
              key={preset}
              onClick={() => choosePreset(preset)}
              type="button"
            >
              {label}
            </button>
          ))}
          <p className="ml-auto text-sm text-muted-dark">
            Kickoff is fixed by the fixture. These controls only filter the catalog.
          </p>
        </div>
      </div>

      {selected.size > 0 && onValueRemove !== undefined ? (
        <div aria-label="Selected fixtures" className="flex flex-wrap gap-2">
          {[...selected].map((matchId) => {
            const match = allMatches.find((candidate) => candidate.id === matchId);
            if (match === undefined) return null;
            return (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-court/30 bg-court/10 px-3 py-2 text-sm"
                key={matchId}
              >
                <span className="font-semibold text-linen">{match.label}</span>
                {selectionLabels[matchId] === undefined ? null : (
                  <span className="text-muted-dark">· {selectionLabels[matchId]}</span>
                )}
                <button
                  aria-label={`Remove ${match.label}`}
                  className="rounded-full p-0.5 text-muted-dark hover:bg-surface-deep hover:text-linen"
                  onClick={() => onValueRemove(matchId)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <p
          className="rounded-2xl border border-border-dark p-5 text-sm text-muted-dark"
          role="status"
        >
          {loading ? "Searching the local fixture catalog…" : "No fixtures match these filters."}
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, dayMatches]) => (
            <section aria-labelledby={`fixture-day-${day.replaceAll(" ", "-")}`} key={day}>
              <h3
                className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-dark"
                id={`fixture-day-${day.replaceAll(" ", "-")}`}
              >
                {day}
              </h3>
              <div className="mt-2 overflow-hidden rounded-2xl border border-border-dark">
                {dayMatches.map((match) => {
                  const isSelected = selected.has(match.id);
                  return (
                    <button
                      aria-pressed={isSelected}
                      className="flex min-h-16 w-full items-center gap-4 border-b border-border-dark bg-surface-deep px-4 py-3 text-left transition last:border-b-0 hover:bg-surface-raised aria-pressed:bg-court/10"
                      key={match.id}
                      onClick={() => onValueChange(match)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-6 shrink-0 items-center justify-center rounded-lg border ${isSelected ? "border-court bg-court text-ink" : "border-border-strong"}`}
                      >
                        {isSelected ? <Check className="size-4" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                        <span className="block font-semibold text-linen">{match.label}</span>
                        <span className="mt-1 block text-sm text-muted-dark sm:mt-0">
                          {formatIsraelKickoff(match.startsAt)}
                          {match.followed ? " · Following" : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {visibleCount < matching.length || hasMore ? (
        <Button
          disabled={loading}
          onClick={() => void showMoreFixtures()}
          type="button"
          variant="outline"
        >
          {loading ? "Loading…" : "Show more fixtures"}
        </Button>
      ) : null}
      {searchError ? (
        <p className="text-sm text-sand" role="alert">
          Fixture search is temporarily unavailable. The fixtures already shown are unchanged.
        </p>
      ) : null}
    </section>
  );
}
