import type { NavigationItem } from "@repo/design-system/components/layout/navigation";
import type { Locale } from "@repo/i18n";

export async function getNavigation(
  _locale: Locale
): Promise<{ navigationItems: NavigationItem[] }> {
  return await Promise.resolve({ navigationItems: [] });
}
