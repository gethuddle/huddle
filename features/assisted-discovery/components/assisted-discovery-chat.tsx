"use client";

import { LocateFixed, MapPin, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ItemGroup } from "@/components/ui/item";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { readSessionOrigin, writeSessionOrigin } from "@/features/discovery/session-origin";
import { AddressSearch } from "@/features/locations/components/address-search";
import type { AddressSuggestion } from "@/features/locations/types";

import {
  assistedDiscoveryOriginSchema,
  assistedDiscoveryResponseSchema,
  type AssistedDiscoveryOrigin,
  type AssistedDiscoveryRequest,
  type AssistedDiscoveryResponse,
} from "../contracts";
import { AssistedDiscoveryResult } from "./assisted-discovery-result";

const EXAMPLE_QUESTIONS = [
  "Anything in Jerusalem this weekend?",
  "Is a friend hosting Arsenal next week?",
  "A Champions League game at a venue serving food",
] as const;

class AssistedDiscoveryHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Assisted discovery request failed");
    this.status = status;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof AssistedDiscoveryHttpError && error.status === 429) {
    return "You have reached the assisted-search limit. Try again later.";
  }
  if (error instanceof AssistedDiscoveryHttpError && error.status === 503) {
    return "Assisted search is temporarily unavailable. Explore still works.";
  }
  return "Assisted search could not finish. Try again or use Explore.";
}

function liveResultMessage(response: AssistedDiscoveryResponse): string {
  if (response.status === "results") {
    return `${response.interpretation}. ${response.results.length} matching huddle${response.results.length === 1 ? "" : "s"} found.`;
  }
  if (response.status === "needs_location") {
    return `${response.interpretation}. Choose a search origin to continue.`;
  }
  return response.interpretation;
}

function clarificationHelp(
  response: Extract<AssistedDiscoveryResponse, { status: "clarification" }>,
) {
  if (response.reason === "unresolved_location") {
    return "Try a different city, area, or public address in Israel.";
  }
  if (["invalid_date", "past_date", "date_range_too_wide"].includes(response.reason)) {
    return "Try a future day, month, or date range of 31 days or fewer.";
  }
  return "Try the official team or competition name.";
}

function AssistantAvatar() {
  return (
    <MessageAvatar aria-hidden="true" className="size-8 bg-primary/12 text-forest">
      <Sparkles className="size-4" />
    </MessageAvatar>
  );
}

type OriginActions = Readonly<{
  loading: boolean;
  locating: boolean;
  requestCurrentLocation: () => void;
  useAddressOrigin: (suggestion: AddressSuggestion | null) => void;
}>;

function AssistantResponse({
  actions,
  response,
}: Readonly<{ actions: OriginActions; response: AssistedDiscoveryResponse }>) {
  return (
    <Message>
      <AssistantAvatar />
      <MessageContent>
        <Bubble className="max-w-full" variant="ghost">
          <BubbleContent className="w-full">
            {response.status === "needs_location" ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">Choose a search origin</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {response.interpretation}. Use your current location or choose an area below. It
                  stays in this browser session and is never added to the URL.
                </p>
                <Button
                  className="mt-3"
                  disabled={actions.locating || actions.loading}
                  onClick={actions.requestCurrentLocation}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <LocateFixed aria-hidden="true" />
                  {actions.locating ? "Requesting location…" : "Use my current location"}
                </Button>
                <details className="mt-3 rounded-xl border border-border px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    Search an area or address
                  </summary>
                  <div className="mt-3 border-t border-border pt-3">
                    <AddressSearch
                      key={response.token}
                      onConfirm={actions.useAddressOrigin}
                      purpose="origin"
                    />
                  </div>
                </details>
              </div>
            ) : null}

            {response.status === "clarification" ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">{response.interpretation}</p>
                <p className="mt-1 text-sm text-muted-foreground">{clarificationHelp(response)}</p>
              </div>
            ) : null}

            {response.status === "unsupported" ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">{response.interpretation}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask for huddles by match, date, place, friends, groups, or venue facilities.
                </p>
              </div>
            ) : null}

            {response.status === "no_results" ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">No exact matches this time.</p>
                <p className="mt-1 text-sm text-muted-foreground">{response.interpretation}</p>
                {response.locationLabel === null ? null : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-3.5" />
                    {response.locationLabel}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={response.exploreHref}>Open Explore</Link>
                  </Button>
                  {response.planHref === null ? null : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={response.planHref}>Plan this fixture</Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {response.status === "results" ? (
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-forest">{response.interpretation}</p>
                  {response.locationLabel === null ? null : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin aria-hidden="true" className="size-3.5" />
                      {response.locationLabel}
                    </span>
                  )}
                </div>
                <ItemGroup aria-label="Matching huddles" className="gap-2.5">
                  {response.results.map((result) => (
                    <AssistedDiscoveryResult key={result.id} result={result} />
                  ))}
                </ItemGroup>
              </div>
            ) : null}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

export function AssistedDiscoveryChat() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [response, setResponse] = useState<AssistedDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState(
    "Ask for a huddle by match, date, place, friends, groups, or venue facilities.",
  );

  async function send(request: AssistedDiscoveryRequest) {
    setLoading(true);
    setError(null);
    setLiveMessage("Finding the best matches…");
    try {
      const apiResponse = await fetch("/api/assisted-discovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!apiResponse.ok) throw new AssistedDiscoveryHttpError(apiResponse.status);
      const parsed = assistedDiscoveryResponseSchema.parse(await apiResponse.json());
      setResponse(parsed);
      setLiveMessage(liveResultMessage(parsed));
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      setLiveMessage(message);
    } finally {
      setLoading(false);
      setLocating(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0 || loading) return;
    const remembered = readSessionOrigin(window.sessionStorage);
    setSubmittedQuery(trimmed);
    setQuery("");
    setResponse(null);
    setError(null);
    void send({
      kind: "interpret",
      query: trimmed,
      ...(remembered === null ? {} : { origin: { lat: remembered.lat, lng: remembered.lng } }),
    });
  }

  function continueWithOrigin(
    origin: AssistedDiscoveryOrigin,
    label: string,
    kind: "browser" | "address",
  ) {
    if (response?.status !== "needs_location") {
      setLocating(false);
      return;
    }
    const parsedOrigin = assistedDiscoveryOriginSchema.safeParse(origin);
    if (!parsedOrigin.success) {
      const message = "That location is outside the Israel pilot.";
      setLocating(false);
      setError(message);
      setLiveMessage(message);
      return;
    }
    try {
      writeSessionOrigin(window.sessionStorage, { ...parsedOrigin.data, label, kind });
    } catch {
      // Searching can continue if this browser refuses session storage.
    }
    void send({ kind: "continue", token: response.token, origin: parsedOrigin.data });
  }

  function requestCurrentLocation() {
    if (!("geolocation" in navigator)) {
      const message = "Current location is unavailable. Search an area or address instead.";
      setError(message);
      setLiveMessage(message);
      return;
    }
    setLocating(true);
    setError(null);
    setLiveMessage("Requesting your current location…");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        continueWithOrigin(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          "Current location",
          "browser",
        ),
      () => {
        const message = "Location was unavailable or declined. Search an area or address instead.";
        setLocating(false);
        setError(message);
        setLiveMessage(message);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function useAddressOrigin(suggestion: AddressSuggestion | null) {
    if (suggestion === null) return;
    continueWithOrigin(
      { lat: suggestion.latitude, lng: suggestion.longitude },
      suggestion.label,
      "address",
    );
  }

  return (
    <section
      aria-label="Ask Huddle conversation"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
    >
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport aria-label="Ask Huddle messages">
            <MessageScrollerContent className="justify-end p-4 sm:p-6">
              <MessageScrollerItem messageId="welcome">
                <Message>
                  <AssistantAvatar />
                  <MessageContent>
                    <Bubble variant="muted">
                      <BubbleContent>
                        <p className="font-semibold text-foreground">
                          What kind of huddle are you after?
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Tell me the match, date, city, friends, group, or venue facilities. Each
                          question is a fresh search.
                        </p>
                      </BubbleContent>
                    </Bubble>
                    {submittedQuery === null ? (
                      <div className="flex flex-wrap gap-2">
                        {EXAMPLE_QUESTIONS.map((example) => (
                          <Button
                            key={example}
                            onClick={() => setQuery(example)}
                            size="xs"
                            type="button"
                            variant="outline"
                          >
                            {example}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>

              {submittedQuery === null ? null : (
                <MessageScrollerItem messageId="question">
                  <Message align="end">
                    <MessageContent>
                      <Bubble align="end">
                        <BubbleContent>{submittedQuery}</BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}

              {loading ? (
                <MessageScrollerItem messageId="loading" scrollAnchor>
                  <Message>
                    <AssistantAvatar />
                    <MessageContent>
                      <Bubble variant="muted">
                        <BubbleContent>
                          <Marker aria-hidden="true" className="text-forest">
                            <MarkerIcon>
                              <Spinner aria-hidden="true" role="presentation" />
                            </MarkerIcon>
                            <MarkerContent>Finding the best matches…</MarkerContent>
                          </Marker>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ) : null}

              {error === null ? null : (
                <MessageScrollerItem messageId="error" scrollAnchor>
                  <Message>
                    <AssistantAvatar />
                    <MessageContent>
                      <Bubble variant="destructive">
                        <BubbleContent role="alert">
                          <p>{error}</p>
                          <Button asChild className="mt-2" size="xs" variant="outline">
                            <Link href="/discover">Open Explore</Link>
                          </Button>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}

              {response === null ? null : (
                <MessageScrollerItem messageId="answer" scrollAnchor>
                  <AssistantResponse
                    actions={{
                      loading,
                      locating,
                      requestCurrentLocation,
                      useAddressOrigin,
                    }}
                    response={response}
                  />
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="border-t border-border bg-background/95 p-3 sm:p-4">
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="huddle-chat-query">
            Ask Huddle what you want to watch
          </label>
          <InputGroup className="min-h-12 rounded-2xl bg-card">
            <InputGroupInput
              autoComplete="off"
              disabled={loading}
              id="huddle-chat-query"
              maxLength={400}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about a match, date, place, friends, or groups…"
              value={query}
            />
            <InputGroupAddon align="inline-end" className="pr-1.5">
              <InputGroupButton
                aria-label="Send question"
                className="rounded-xl bg-primary text-primary-foreground hover:bg-court-hover"
                disabled={loading || query.trim().length === 0}
                size="icon-sm"
                type="submit"
                variant="default"
              >
                {loading ? (
                  <Spinner aria-hidden="true" role="presentation" />
                ) : (
                  <Send aria-hidden="true" />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <p aria-live="polite" className="sr-only" role="status">
          {liveMessage}
        </p>
        <p className="mt-1.5 px-1 text-right text-[0.68rem] text-muted-foreground">
          {query.length}/400 · One question at a time
        </p>
      </div>
    </section>
  );
}
