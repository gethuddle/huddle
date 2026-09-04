"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { venueSlugSchema } from "@/features/venues/schemas";

const availabilitySchema = z.object({ available: z.boolean() }).strict();

type Availability = "available" | "taken" | "unavailable";

export function VenueSlugField({
  venueId,
  defaultValue,
  currentSlug,
  errors,
}: Readonly<{
  venueId: string;
  defaultValue: string;
  currentSlug: string;
  errors?: string[];
}>) {
  const [value, setValue] = useState(defaultValue);
  const [result, setResult] = useState<{ slug: string; state: Availability } | null>(null);
  const [dismissedServerErrors, setDismissedServerErrors] = useState<readonly string[] | undefined>(
    undefined,
  );
  const parsed = venueSlugSchema.safeParse(value);
  const slug = parsed.success ? parsed.data : null;
  const current = slug !== null && slug === currentSlug.trim().toLowerCase();
  const feedback = current
    ? "current"
    : slug === null
      ? "invalid"
      : result?.slug === slug
        ? result.state
        : "checking";

  useEffect(() => {
    if (slug === null || current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ venueId, slug });
        const response = await fetch(`/api/venues/slug-availability?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Availability unavailable");
        const body = availabilitySchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setResult({ slug, state: body.available ? "available" : "taken" });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ slug, state: "unavailable" });
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [current, slug, venueId]);

  const hasError = errors?.[0] !== undefined && dismissedServerErrors !== errors;
  const invalid = hasError || feedback === "taken" || (value !== "" && feedback === "invalid");
  const statusClassName =
    feedback === "available"
      ? "text-forest"
      : feedback === "taken"
        ? "text-destructive"
        : feedback === "unavailable"
          ? "text-sand"
          : "text-muted-foreground";

  return (
    <div>
      <Label htmlFor="venue-settings-slug">Huddle page address</Label>
      <Input
        aria-describedby={
          !hasError
            ? "venue-settings-slug-help venue-settings-slug-preview venue-settings-slug-availability"
            : "venue-settings-slug-error"
        }
        aria-invalid={invalid ? true : undefined}
        autoCapitalize="none"
        defaultValue={defaultValue}
        id="venue-settings-slug"
        maxLength={60}
        name="slug"
        onInput={(event) => {
          const nextValue = event.currentTarget.value;
          const next = venueSlugSchema.safeParse(nextValue);
          const nextSlug = next.success ? next.data : null;
          if (nextSlug !== slug) {
            setResult(null);
            setDismissedServerErrors(errors);
          }
          setValue(nextValue);
        }}
        required
      />
      <p className="mt-2 text-xs text-muted-foreground" id="venue-settings-slug-help">
        This is your page on Huddle, not your business website.
      </p>
      <p className="mt-1 text-xs text-muted-foreground" id="venue-settings-slug-preview">
        Your Huddle page: <code className="break-all">/venues/{slug ?? "…"}</code>
      </p>
      <span
        className={`mt-2 block text-sm ${statusClassName}`}
        id="venue-settings-slug-availability"
        role="status"
      >
        {feedback === "current"
          ? "This is your current Huddle page address."
          : feedback === "checking"
            ? "Checking availability…"
            : feedback === "available"
              ? "Huddle page address available. It is reserved only when you save."
              : feedback === "taken"
                ? "This Huddle page address is already taken. Try another."
                : feedback === "unavailable"
                  ? "Availability could not be checked. It will be checked when you save."
                  : value === ""
                    ? ""
                    : parsed.error?.issues[0]?.message}
      </span>
      {!hasError ? null : (
        <span className="mt-2 block text-sm text-sand" id="venue-settings-slug-error">
          {errors[0]}
        </span>
      )}
    </div>
  );
}
