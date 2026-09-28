import { draftMode } from "next/headers";

import { LivePreview } from "./components/live-preview";

export { CmsPageLayout } from "./components/page-layout";
export { getNavigation } from "./lib/navigation";

export async function CmsLayoutIntegration() {
  const { isEnabled } = await draftMode();

  return <LivePreview isEnabled={isEnabled} />;
}
