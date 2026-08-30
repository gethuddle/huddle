"use client";

import type { PrivateEventCatalog } from "@/features/events/catalog";
import { EventCreateFlow } from "@/features/events/components/event-create-flow";

/** Compatibility export while every caller moves to the persisted three-phase flow. */
export function PrivateEventForm({
  catalog,
  initialMatchId = "",
}: Readonly<{ catalog: PrivateEventCatalog; initialMatchId?: string }>) {
  return <EventCreateFlow catalog={catalog} initialMatchId={initialMatchId} />;
}
