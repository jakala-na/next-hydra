import { draftMode } from "next/headers";

import { LivePreview } from "./components/live-preview";

export {
  CmsGlobalRegion,
  type CmsGlobalRegionName,
} from "./components/global-region";
export { getNavigation } from "./lib/navigation";

export async function CmsLayoutIntegration() {
  const { isEnabled } = await draftMode();

  return <LivePreview isEnabled={isEnabled} />;
}
