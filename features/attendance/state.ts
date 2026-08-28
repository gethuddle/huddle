import type { ActionResult } from "@/lib/errors";

export type AttendanceActionState = ActionResult<Readonly<{ message: string }>>;
