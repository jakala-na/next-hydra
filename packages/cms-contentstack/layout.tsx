import type { Locale } from "@repo/i18n";
import { draftMode } from "next/headers";
import type { ReactNode } from "react";

import { SiteAnnouncement } from "./components/announcement";
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

export function CmsPageLayout({
  children,
  header,
  footer,
  locale,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  locale: Locale;
}) {
  return (
    <>
      <SiteAnnouncement locale={locale} />
      {header}
      {children}
      {footer}
    </>
  );
}
