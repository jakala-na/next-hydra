import { getNavigation } from "@repo/cms/layout";
import { getLocale } from "@repo/i18n";

import { NavigationSearch } from "./navigation-search";

/** Local navigation search; a search provider can contribute a different module. */
export async function HeaderSearch() {
  const locale = await getLocale();
  const { navigationItems } = await getNavigation(locale);
  return <NavigationSearch navigationItems={navigationItems} />;
}
