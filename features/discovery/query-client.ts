"use client";

import { QueryClient } from "@tanstack/react-query";

import { HUDDLE_SESSION_CLEARED_EVENT } from "@/features/auth/huddle-session-events";

let browserQueryClient: QueryClient | undefined;
let sessionListenerRegistered = false;

function createDiscoveryQueryClient() {
  return new QueryClient();
}

export function getDiscoveryQueryClient() {
  if (typeof window === "undefined") return createDiscoveryQueryClient();

  if (!sessionListenerRegistered) {
    window.addEventListener(HUDDLE_SESSION_CLEARED_EVENT, clearDiscoveryQueryClient);
    sessionListenerRegistered = true;
  }
  browserQueryClient ??= createDiscoveryQueryClient();
  return browserQueryClient;
}

export function clearDiscoveryQueryClient() {
  browserQueryClient?.clear();
  browserQueryClient = undefined;
}
