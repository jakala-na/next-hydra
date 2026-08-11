import type { Locale } from "@repo/i18n";

export type CmsGlobalRegionName =
  | "pre-header"
  | "post-header"
  | "pre-footer"
  | "post-footer";

/**
 * Optional shell placement. Contentstack has no region model wired yet, so an
 * unconfigured placement contributes no UI.
 */
export function CmsGlobalRegion(_props: {
  locale: Locale;
  name: CmsGlobalRegionName;
}) {
  return null;
}
