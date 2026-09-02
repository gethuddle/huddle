import { FanBottomNavigation } from "@/features/workspaces/components/fan-bottom-navigation";
import { VenueMobileNavigation } from "@/features/workspaces/components/venue-workspace-header";
import type { WorkspaceShellContext } from "@/features/workspaces/types";

export function MobileNavigation({
  assistedDiscoveryEnabled,
  context,
}: Readonly<{ assistedDiscoveryEnabled: boolean; context: WorkspaceShellContext }>) {
  if (context.active?.kind === "fan") {
    return <FanBottomNavigation assistedDiscoveryEnabled={assistedDiscoveryEnabled} />;
  }
  if (context.active?.kind === "venue" && context.active.slug !== null) {
    return <VenueMobileNavigation slug={context.active.slug} />;
  }
  return null;
}
