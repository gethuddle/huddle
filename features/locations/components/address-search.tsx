"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addressSuggestionsSchema } from "@/features/locations/schemas";
import type { AddressSuggestion, PublicLocationKind } from "@/features/locations/types";

type AddressSearchProps = Readonly<{
  city: string;
  locationKind: PublicLocationKind;
  onConfirm: (suggestion: AddressSuggestion | null) => void;
}>;

export function AddressSearch({ city, locationKind, onConfirm }: AddressSearchProps) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly AddressSuggestion[]>([]);
  const [selected, setSelected] = useState<AddressSuggestion | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const confirmed = useRef<AddressSuggestion | null>(null);
  const latestRequest = useRef(0);
  const previousCity = useRef(city);

  function invalidateConfirmation() {
    setSelected(null);
    if (confirmed.current !== null) {
      confirmed.current = null;
      onConfirm(null);
    }
  }

  useEffect(() => {
    if (previousCity.current === city) return;
    previousCity.current = city;
    latestRequest.current += 1;
    setQuery("");
    setSuggestions([]);
    setState("idle");
    setSelected(null);
    if (confirmed.current !== null) {
      confirmed.current = null;
      onConfirm(null);
    }
  }, [city, onConfirm]);

  async function search() {
    if (query.trim().length < 3) return;
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    invalidateConfirmation();
    setSuggestions([]);
    setState("loading");

    try {
      const response = await fetch("/api/locations/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, city, locationKind }),
      });
      if (!response.ok) throw new Error("address-search-failed");

      const payload = (await response.json()) as unknown;
      const parsed = addressSuggestionsSchema.safeParse(
        typeof payload === "object" && payload !== null && "suggestions" in payload
          ? payload.suggestions
          : null,
      );
      if (!parsed.success) throw new Error("address-search-invalid-response");
      if (latestRequest.current !== request) return;

      setSuggestions(parsed.data);
      setState(parsed.data.length === 0 ? "empty" : "ready");
    } catch {
      if (latestRequest.current !== request) return;
      setState("error");
    }
  }

  return (
    <section className="space-y-4" aria-labelledby={`${listboxId}-title`}>
      <div>
        <h2 className="text-lg font-semibold" id={`${listboxId}-title`}>
          Find the public address
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search deliberately, then confirm the matching pin. Results are limited to Israel.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${listboxId}-query`}>Public address</Label>
          <Input
            aria-controls={suggestions.length > 0 ? listboxId : undefined}
            autoComplete="street-address"
            className="mt-2"
            id={`${listboxId}-query`}
            maxLength={160}
            minLength={3}
            onChange={(event) => {
              latestRequest.current += 1;
              setQuery(event.currentTarget.value);
              setSuggestions([]);
              setState("idle");
              invalidateConfirmation();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            required
            value={query}
          />
        </div>
        <Button
          disabled={state === "loading" || query.trim().length < 3}
          onClick={() => void search()}
          type="button"
        >
          {state === "loading" ? "Searching…" : "Search addresses"}
        </Button>
      </div>

      {state === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          Address search is temporarily unavailable. Wait a moment and try again.
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-muted-foreground" role="status">
          No matching public addresses were found. Check the street and city, then search again.
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <div aria-label="Address results" className="grid gap-2" id={listboxId} role="listbox">
          {suggestions.map((suggestion) => (
            <button
              aria-selected={selected?.id === suggestion.id}
              className="rounded-xl border border-border bg-card p-4 text-left text-sm transition hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-selected:border-primary aria-selected:bg-secondary"
              key={suggestion.id}
              onClick={() => {
                if (confirmed.current !== null) {
                  confirmed.current = null;
                  onConfirm(null);
                }
                setSelected(suggestion);
              }}
              role="option"
              type="button"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      {selected === null ? null : (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" role="status">
            Pin ready to confirm in {selected.city}.
          </p>
          <Button
            onClick={() => {
              confirmed.current = selected;
              onConfirm(selected);
            }}
            type="button"
          >
            Confirm this address
          </Button>
        </div>
      )}

      <OpenStreetMapAttribution />
    </section>
  );
}

function OpenStreetMapAttribution() {
  return (
    <p className="text-xs text-muted-foreground">
      Address data ©{" "}
      <a
        className="underline underline-offset-2"
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        OpenStreetMap contributors
      </a>
      , available under the ODbL.
    </p>
  );
}
