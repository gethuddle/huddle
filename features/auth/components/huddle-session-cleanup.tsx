"use client";

import { useEffect } from "react";

import { clearHuddleSessionStorage } from "@/features/auth/huddle-session-storage";
import { consumeHuddleSessionCleanupAction } from "@/features/auth/session-cleanup-actions";

export function HuddleSessionCleanup({
  purpose,
}: Readonly<{ purpose: "account-erasure" | "sign-out" }>) {
  useEffect(() => {
    if (clearHuddleSessionStorage()) {
      void consumeHuddleSessionCleanupAction(purpose).catch(() => undefined);
    }
  }, [purpose]);

  return null;
}
