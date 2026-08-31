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
  purpose?: "public-address" | "origin";
}>;

export function AddressSearch({
  city,
  locationKind,
  onConfirm,
  purpose = "public-address",
}: AddressSearchProps) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const confirmed = useRef<AddressSuggestion | null>(null);
  const latestRequest = useRef(0);
  const previousCity = useRef(city);

  function invalidateConfirmation() {
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
    setActiveIndex(-1);
    if (confirmed.current !== null) {
      confirmed.current = null;
      onConfirm(null);
    }
  }, [city, onConfirm]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3 || confirmed.current?.label === query) return;

    const request = latestRequest.current + 1;
    latestRequest.current = request;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch("/api/locations/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: normalizedQuery, city, locationKind }),
          signal: controller.signal,
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
        setActiveIndex(-1);
        setState(parsed.data.length === 0 ? "empty" : "ready");
      } catch {
        if (controller.signal.aborted || latestRequest.current !== request) return;
        setState("error");
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [city, locationKind, query, retry]);

  function chooseSuggestion(suggestion: AddressSuggestion) {
    latestRequest.current += 1;
    confirmed.current = suggestion;
    setQuery(suggestion.label);
    setSuggestions([]);
    setActiveIndex(-1);
    setState("idle");
    onConfirm(suggestion);
  }

  return (
    <section className="space-y-4" aria-labelledby={`${listboxId}-title`}>
      <div>
        <h2 className="text-lg font-semibold" id={`${listboxId}-title`}>
          {purpose === "origin" ? "Search another area" : "Find the public address"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {purpose === "origin"
            ? "Choose any city, neighborhood, or address in Israel. Results rank by distance from it."
            : "Search deliberately, then confirm the matching pin. Results are limited to Israel."}
        </p>
      </div>

      <div>
        <div className="relative min-w-0">
          <Label htmlFor={`${listboxId}-query`}>
            {purpose === "origin" ? "City or address" : "Public address"}
          </Label>
          <Input
            aria-activedescendant={
              activeIndex < 0 ? undefined : `${listboxId}-option-${activeIndex}`
            }
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={suggestions.length > 0}
            autoComplete="street-address"
            className="mt-2"
            id={`${listboxId}-query`}
            maxLength={160}
            minLength={3}
            onChange={(event) => {
              latestRequest.current += 1;
              setQuery(event.currentTarget.value);
              setSuggestions([]);
              setActiveIndex(-1);
              setState("idle");
              invalidateConfirmation();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "ArrowDown" && suggestions.length > 0) {
                event.preventDefault();
                setActiveIndex((current) => (current + 1) % suggestions.length);
              } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                event.preventDefault();
                setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                const suggestion = suggestions[activeIndex];
                if (suggestion !== undefined) chooseSuggestion(suggestion);
              } else if (event.key === "Escape") {
                setSuggestions([]);
                setActiveIndex(-1);
              }
            }}
            required={purpose === "public-address"}
            role="combobox"
            value={query}
          />
          {suggestions.length > 0 ? (
            <div
              aria-label="Address results"
              className="absolute z-20 mt-2 grid w-full gap-1 rounded-xl border border-border bg-card p-2 shadow-lg"
              id={listboxId}
              role="listbox"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  aria-selected={activeIndex === index}
                  className="rounded-lg px-3 py-3 text-left text-sm transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-selected:bg-secondary"
                  id={`${listboxId}-option-${index}`}
                  key={suggestion.id}
                  onClick={() => chooseSuggestion(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {state === "loading" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Finding addresses…
        </p>
      ) : null}

      {state === "error" ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-destructive">
            Address search is temporarily unavailable. Wait a moment and try again.
          </p>
          <Button
            onClick={() => setRetry((value) => value + 1)}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-muted-foreground" role="status">
          No matching places were found. Check the city or address, then search again.
        </p>
      ) : null}

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
