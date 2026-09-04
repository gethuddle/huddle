"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { profileHandleSchema } from "@/features/profiles/schemas";
import { cn } from "@/lib/utils";

const availabilitySchema = z.object({ available: z.boolean() }).strict();

export function ProfileHandleField({
  defaultValue,
  currentHandle,
  errors,
}: Readonly<{
  defaultValue: string;
  currentHandle: string;
  errors?: string[];
}>) {
  const [value, setValue] = useState(defaultValue);
  const visibleErrors =
    value.trim().toLowerCase() === defaultValue.trim().toLowerCase() ? errors : undefined;
  const [result, setResult] = useState<{
    handle: string;
    state: "available" | "taken" | "unavailable";
  } | null>(null);
  const parsed = profileHandleSchema.safeParse(value);
  const handle = parsed.success ? parsed.data : null;
  const current = handle !== null && handle === currentHandle.trim().toLowerCase();
  const feedback = current
    ? "current"
    : handle === null
      ? "invalid"
      : result?.handle === handle
        ? result.state
        : "checking";

  useEffect(() => {
    if (handle === null || current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/profiles/handle-availability?handle=${encodeURIComponent(handle)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Availability unavailable");
        const body = availabilitySchema.parse(await response.json());
        if (!controller.signal.aborted)
          setResult({ handle, state: body.available ? "available" : "taken" });
      } catch {
        if (!controller.signal.aborted) setResult({ handle, state: "unavailable" });
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [handle, current]);

  return (
    <div>
      <Label className="text-foreground" htmlFor="profile-handle">
        Handle
      </Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-[1.05rem] text-muted-foreground"
        >
          @
        </span>
        <Input
          aria-describedby="profile-handle-help profile-handle-availability profile-handle-error"
          aria-invalid={
            visibleErrors !== undefined ||
            feedback === "taken" ||
            (value !== "" && feedback === "invalid")
              ? true
              : undefined
          }
          autoCapitalize="none"
          autoComplete="username"
          className="mt-2 pl-9"
          defaultValue={defaultValue}
          id="profile-handle"
          maxLength={30}
          name="handle"
          placeholder="matchday_fan"
          required
          onInput={(event) => {
            const nextHandle = profileHandleSchema.safeParse(event.currentTarget.value);
            if ((nextHandle.success ? nextHandle.data : null) !== handle) setResult(null);
            setValue(event.currentTarget.value);
          }}
        />
      </div>
      <span className="mt-2 block text-xs text-muted-foreground" id="profile-handle-help">
        Your public username: 3–30 letters, numbers, or underscores. Huddle stores it in lowercase.
      </span>
      <span
        className={cn(
          "mt-2 block text-sm",
          feedback === "available" || feedback === "current"
            ? "text-forest"
            : feedback === "taken" || (feedback === "invalid" && value !== "")
              ? "text-destructive"
              : "text-muted-foreground",
        )}
        id="profile-handle-availability"
        role="status"
      >
        {feedback === "current"
          ? "This is your current username."
          : feedback === "checking"
            ? "Checking username…"
            : feedback === "available"
              ? "Username available. It is reserved only when you save."
              : feedback === "taken"
                ? "This username is already taken. Try another."
                : feedback === "unavailable"
                  ? "Availability could not be checked. It will be checked when you save."
                  : value === ""
                    ? ""
                    : parsed.error?.issues[0]?.message}
      </span>
      {visibleErrors?.[0] === undefined ? null : (
        <span className="mt-2 block text-sm text-sand" id="profile-handle-error">
          {visibleErrors[0]}
        </span>
      )}
    </div>
  );
}
