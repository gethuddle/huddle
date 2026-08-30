export type WorkspaceKind = "fan" | "venue";

export type WorkspaceSummary = Readonly<{
  kind: WorkspaceKind;
  id: string;
  slug: string | null;
  label: string;
  role: "fan" | "owner" | "admin";
}>;

export type WorkspaceSelection = Readonly<{
  kind: WorkspaceKind;
  id: string;
}>;

export type WorkspaceShellContext = Readonly<{
  active: WorkspaceSummary | null;
  available: readonly WorkspaceSummary[];
  isModerator: boolean;
}>;

export type AppShellState = Readonly<{
  isSignedIn: boolean;
  workspace: WorkspaceShellContext;
}>;
