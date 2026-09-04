"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

export function NavigationPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute right-1.5 top-1.5 inline-flex size-3 items-center justify-center transition-opacity motion-reduce:transition-none",
        pending ? "opacity-60" : "opacity-0",
      )}
      data-pending={String(pending)}
    >
      <LoaderCircle
        className={cn("size-3 motion-reduce:animate-none", pending && "animate-spin")}
      />
    </span>
  );
}
