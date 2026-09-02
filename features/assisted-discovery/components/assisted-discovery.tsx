"use client";

import { LocateFixed, Search } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { readSessionOrigin, writeSessionOrigin } from "@/features/discovery/session-origin";
import { AddressSearch } from "@/features/locations/components/address-search";
import type { AddressSuggestion } from "@/features/locations/types";
import { TeamMark } from "@/features/sports/components/team-initials";
import { formatIsraelKickoff } from "@/features/sports/time";
import { VenueVerificationBadge } from "@/features/venues/components/venue-verification-badge";

import {
  assistedDiscoveryOriginSchema,
  assistedDiscoveryResponseSchema,
  type AssistedDiscoveryOrigin,
  type AssistedDiscoveryRequest,
  type AssistedDiscoveryResponse,
  type AssistedDiscoveryResultCard,
} from "../contracts";
import type { VenueFacility } from "../schemas";

const FACILITY_LABELS: Record<VenueFacility, string> = {
  wheelchair_accessible: "Wheelchair accessible",
  step_free_access: "Step-free access",
  accessible_toilet: "Accessible toilet",
  hearing_loop: "Hearing loop",
  parking: "Parking",
  food: "Food",
  drinks: "Drinks",
};

const PARTICIPATION_LABELS: Record<
  NonNullable<AssistedDiscoveryResultCard["viewerParticipationState"]>,
  string
> = {
  host: "You host this",
  requested: "Your request is pending",
  approved: "You are going",
  declined: "Your request was declined",
  left: "You left this huddle",
  removed: "You were removed",
  invited: "You are invited",
};

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

function attendanceSummary(result: AssistedDiscoveryResultCard): string {
  if (result.attendanceMode === "open_door") return "Open door · no RSVP needed";
  if (result.remainingCapacity === null) return `${result.approvedAttendeeCount} going`;
  return `${result.approvedAttendeeCount} going · ${result.remainingCapacity} ${result.remainingCapacity === 1 ? "place" : "places"} left`;
}

function ResultItem({ result }: Readonly<{ result: AssistedDiscoveryResultCard }>) {
  const participation =
    result.viewerParticipationState === null
      ? null
      : PARTICIPATION_LABELS[result.viewerParticipationState];
  return (
    <Item
      className="items-stretch gap-4 rounded-none border-0 px-0 py-5 sm:flex-nowrap sm:items-center"
      role="listitem"
      size="sm"
    >
      <ItemMedia className="self-start sm:self-center">
        <div
          className="flex items-center gap-2"
          aria-label={`${result.match.homeTeamName} versus ${result.match.awayTeamName}`}
        >
          <TeamMark
            crestUrl={result.match.homeTeamCrestUrl}
            name={result.match.homeTeamName}
            size="sm"
            tla={result.match.homeTeamTla}
          />
          <span className="text-[0.65rem] font-semibold text-muted-foreground" aria-hidden="true">
            vs
          </span>
          <TeamMark
            crestUrl={result.match.awayTeamCrestUrl}
            name={result.match.awayTeamName}
            size="sm"
            tla={result.match.awayTeamTla}
          />
        </div>
      </ItemMedia>

      <ItemContent className="min-w-0 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {result.match.competitionName} · {formatIsraelKickoff(result.startsAt)}
            </p>
            <ItemTitle className="mt-1 line-clamp-none text-base font-semibold text-foreground">
              <h3>{result.title}</h3>
            </ItemTitle>
          </div>
          {participation === null ? null : <Badge variant="positive">{participation}</Badge>}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Hosted by {result.host.displayName}</span>
          {result.host.kind === "venue" && result.host.verificationStatus !== null ? (
            <span className="[&>span]:text-xs">
              <VenueVerificationBadge status={result.host.verificationStatus} />
            </span>
          ) : null}
          {result.group === null ? null : (
            <span>
              {result.group.relationship === "organizer" ? "Organized by" : "Shared with"}{" "}
              {result.group.slug === null ? (
                <span className="font-medium text-foreground">{result.group.name}</span>
              ) : (
                <Link
                  className="font-medium text-forest hover:text-forest-hover hover:underline"
                  href={`/groups/${result.group.slug}`}
                >
                  {result.group.name}
                </Link>
              )}
            </span>
          )}
          <span>{result.locationSummary}</span>
          <span>{attendanceSummary(result)}</span>
          {result.attendanceMode === "reservations" ? (
            <span>{result.requiresApproval ? "Attendance review" : "Immediate join"}</span>
          ) : null}
        </div>

        {result.matchedReasons.length === 0 ? null : (
          <div className="flex flex-wrap gap-2">
            {result.matchedReasons.map((reason) => (
              <Badge key={reason} variant="positive">
                {reason}
              </Badge>
            ))}
          </div>
        )}
        {result.venueFacilities.length === 0 ? null : (
          <div className="flex flex-wrap gap-2" aria-label="Self-reported venue facilities">
            {result.venueFacilities.map((facility) => (
              <Badge key={facility} variant="outline">
                Self-reported: {FACILITY_LABELS[facility]}
              </Badge>
            ))}
          </div>
        )}
      </ItemContent>

      <ItemActions className="w-full sm:w-auto sm:self-center">
        <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
          <Link href={`/events/${result.id}`}>Open huddle</Link>
        </Button>
      </ItemActions>
    </Item>
  );
}

export function AssistedDiscovery() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<AssistedDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState(
    "Describe a huddle to search your eligible events.",
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
      // The search can continue if this browser refuses session storage.
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
    <section aria-labelledby="assisted-discovery-heading" className="border-t border-border py-8">
      <p className="text-sm font-medium text-forest">Assisted discovery</p>
      <h2
        className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
        id="assisted-discovery-heading"
      >
        What kind of huddle are you after?
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Describe the match, timing, venue, friends, or groups. Huddle returns up to three exact
        matches you are allowed to see.
      </p>

      <Card className="mt-5 gap-0 py-0">
        <CardContent className="px-4 py-4 sm:px-6">
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="huddle-query">
              Describe the huddle you want
            </label>
            <InputGroup className="min-h-14 rounded-2xl bg-background">
              <InputGroupInput
                disabled={loading}
                id="huddle-query"
                maxLength={400}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="A Premier League game tomorrow at a venue serving food"
                value={query}
              />
              <InputGroupAddon align="inline-end" className="pr-2">
                <InputGroupButton
                  className="rounded-xl bg-primary px-3 text-primary-foreground hover:bg-court-hover"
                  disabled={loading || query.trim().length === 0}
                  size="sm"
                  type="submit"
                  variant="default"
                >
                  {loading ? (
                    <Spinner aria-hidden="true" role="presentation" />
                  ) : (
                    <Search aria-hidden="true" />
                  )}
                  <span>Find huddles</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="mt-2 text-right text-xs text-muted-foreground">
              {query.length}/400 · One search at a time
            </p>
          </form>

          {loading ? (
            <Marker aria-live="polite" className="mt-3 text-forest" role="status">
              <MarkerIcon>
                <Spinner aria-hidden="true" role="presentation" />
              </MarkerIcon>
              <MarkerContent>Finding the best matches…</MarkerContent>
            </Marker>
          ) : (
            <p aria-live="polite" className="sr-only" role="status">
              {liveMessage}
            </p>
          )}

          {error === null ? null : (
            <div className="mt-5 rounded-2xl border border-sand/40 bg-sand/10 p-4" role="alert">
              <p className="font-semibold text-foreground">{error}</p>
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link href="/discover">Open Explore</Link>
              </Button>
            </div>
          )}

          {response?.status === "needs_location" ? (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="font-semibold text-foreground">
                {response.locationQuery === null
                  ? "Choose a search origin"
                  : `Confirm ${response.locationQuery} as the search area`}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {response.interpretation}.{" "}
                {response.locationQuery === null
                  ? "Choose your current location or confirm an OpenStreetMap area below."
                  : "Confirm an OpenStreetMap suggestion below."}{" "}
                Your origin stays in this browser session and is never added to a URL.
              </p>
              {response.locationQuery === null ? (
                <>
                  <Button
                    className="mt-4"
                    disabled={locating || loading}
                    onClick={requestCurrentLocation}
                    type="button"
                    variant="outline"
                  >
                    <LocateFixed aria-hidden="true" />
                    {locating ? "Requesting location…" : "Use my current location"}
                  </Button>
                  <details className="mt-4 rounded-2xl border border-border px-4 py-3">
                    <summary className="cursor-pointer font-semibold text-foreground">
                      Search an area or address
                    </summary>
                    <div className="mt-4 border-t border-border pt-4">
                      <AddressSearch
                        key={response.token}
                        onConfirm={useAddressOrigin}
                        purpose="origin"
                      />
                    </div>
                  </details>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-border px-4 py-4">
                  <AddressSearch
                    key={response.token}
                    initialQuery={response.locationQuery}
                    onConfirm={useAddressOrigin}
                    purpose="origin"
                  />
                </div>
              )}
            </div>
          ) : null}

          {response?.status === "clarification" ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="font-semibold text-foreground">{response.interpretation}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try the official team or competition name.
              </p>
            </div>
          ) : null}

          {response?.status === "unsupported" ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="font-semibold text-foreground">{response.interpretation}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try asking for huddles by match, date, host type, friends, groups, or venue
                facilities.
              </p>
            </div>
          ) : null}

          {response?.status === "no_results" ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="font-semibold text-foreground">No exact matches this time.</p>
              <p className="mt-2 text-sm text-muted-foreground">{response.interpretation}</p>
              <div className="mt-4 flex flex-wrap gap-2">
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

          {response?.status === "results" ? (
            <div
              aria-busy={loading}
              className="mt-5 border-t border-border pt-4 transition-opacity"
            >
              <p className="text-sm font-medium text-forest">{response.interpretation}</p>
              <ItemGroup
                aria-label="Matching huddles"
                className={`mt-2 gap-0 divide-y divide-border ${loading ? "opacity-65" : "opacity-100"}`}
              >
                {response.results.map((result) => (
                  <ResultItem key={result.id} result={result} />
                ))}
              </ItemGroup>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
