import type { ActionResult } from "@/lib/errors";

export type ModerationActionState = ActionResult<Readonly<{ message: string }>>;
