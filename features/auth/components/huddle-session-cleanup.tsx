"use client";

import { useEffect } from "react";

import { broadcastHuddleSessionCleared } from "@/features/auth/huddle-session-events";
import { clearHuddleSessionStorage } from "@/features/auth/huddle-session-storage";
import { consumeHuddleSessionCleanupAction } from "@/features/auth/session-cleanup-actions";

export function HuddleSessionCleanup({
  purpose,
}: Readonly<{ purpose: "account-erasure" | "sign-out" }>) {
  useEffect(() => {
    // In-memory private data must clear even when browser privacy settings make
    // sessionStorage unavailable. The server marker is consumed only after the
    // tab-scoped storage clear succeeds so a later page can retry it.
    broadcastHuddleSessionCleared();
    if (clearHuddleSessionStorage()) {
      void consumeHuddleSessionCleanupAction(purpose).catch(() => undefined);
    }
  }, [purpose]);

  return null;
}
