import type { Locale } from "@repo/i18n";

export type CmsGlobalRegionName =
  | "pre-header"
  | "post-header"
  | "pre-footer"
  | "post-footer";

type CmsGlobalRegionProps = {
  locale: Locale;
  name: CmsGlobalRegionName;
};

export function CmsGlobalRegion(_props: CmsGlobalRegionProps) {
  return null;
}
