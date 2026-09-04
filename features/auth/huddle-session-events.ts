"use client";

export const HUDDLE_SESSION_CLEARED_EVENT = "huddle:session-cleared";

export function broadcastHuddleSessionCleared() {
  window.dispatchEvent(new Event(HUDDLE_SESSION_CLEARED_EVENT));
}
