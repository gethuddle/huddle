"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

type TeamInitialsProps = Readonly<{
  crestUrl?: string | null;
  name: string;
  tla?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}>;

export function teamInitials(name: string, tla: string | null): string {
  if (tla !== null && tla.trim().length >= 2) return tla.trim().slice(0, 3).toUpperCase();

  const words = name
    .replace(/\b(?:fc|cf|afc)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 3)
    .map((word) => word.at(0))
    .join("")
    .toUpperCase();

  if (initials.length >= 2) return initials;
  const cleanedName = words.join(" ").trim();
  return (cleanedName || name.trim()).slice(0, 3).toUpperCase();
}

export function TeamMark({
  crestUrl = null,
  name,
  tla,
  className,
  size = "md",
}: TeamInitialsProps) {
  const [failedCrestUrl, setFailedCrestUrl] = useState<string | null>(null);
  const [loadedCrestUrl, setLoadedCrestUrl] = useState<string | null>(null);

  const sharedClassName = cn(
    "shrink-0 rounded-full border border-border bg-muted",
    size === "sm" && "size-8",
    size === "md" && "size-11",
    size === "lg" && "size-14",
    className,
  );

  if (crestUrl !== null && failedCrestUrl !== crestUrl) {
    return (
      <span className={cn("relative inline-flex", sharedClassName, className)}>
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 inline-flex items-center justify-center font-bold tracking-[0.06em] text-forest transition-opacity",
            size === "sm" && "text-[0.65rem]",
            size === "md" && "text-xs",
            size === "lg" && "text-sm",
            loadedCrestUrl === crestUrl && "opacity-0",
          )}
        >
          {teamInitials(name, tla ?? null)}
        </span>
        <Image
          alt={name}
          className={cn(
            "relative size-full rounded-full object-contain p-1 opacity-0 transition-opacity",
            loadedCrestUrl === crestUrl && "opacity-100",
          )}
          height={56}
          onError={() => setFailedCrestUrl(crestUrl)}
          onLoad={() => setLoadedCrestUrl(crestUrl)}
          src={crestUrl}
          unoptimized
          width={56}
        />
      </span>
    );
  }

  return (
    <span
      aria-label={name}
      className={cn(
        sharedClassName,
        "inline-flex items-center justify-center font-bold tracking-[0.06em] text-forest",
        size === "sm" && "text-[0.65rem]",
        size === "md" && "text-xs",
        size === "lg" && "text-sm",
      )}
      role="img"
    >
      {teamInitials(name, tla ?? null)}
    </span>
  );
}

export const TeamInitials = TeamMark;
