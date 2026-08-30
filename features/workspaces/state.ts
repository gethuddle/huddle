import type { ActionResult } from "@/lib/errors";

import type { WorkspaceSelection, WorkspaceSummary } from "./types";

export const WORKSPACE_COOKIE_NAME = "huddle-workspace";

export type WorkspaceActionData = Readonly<{
  message: string;
  redirectTo: string;
}>;

export type WorkspaceActionState = ActionResult<WorkspaceActionData> | null;
export const INITIAL_WORKSPACE_ACTION_STATE: WorkspaceActionState = null;

export function chooseWorkspace(
  available: readonly WorkspaceSummary[],
  remembered: WorkspaceSelection | null,
): WorkspaceSummary | null {
  if (remembered !== null) {
    const current = available.find(
      (workspace) => workspace.kind === remembered.kind && workspace.id === remembered.id,
    );
    if (current !== undefined) return current;
  }

  return available.find((workspace) => workspace.kind === "fan") ?? available[0] ?? null;
}

export function workspaceLanding(workspace: WorkspaceSummary): string {
  if (workspace.kind === "fan") return "/";
  return workspace.slug === null
    ? "/onboarding"
    : `/venues/${encodeURIComponent(workspace.slug)}/workspace`;
}

export function serializeWorkspaceSelection(selection: WorkspaceSelection) {
  return `${selection.kind}:${selection.id}`;
}

export function workspaceCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
