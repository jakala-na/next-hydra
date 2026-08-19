import type { NavigationItem } from "@repo/design-system/components/layout/navigation";
import type { Locale } from "@repo/i18n";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";

import { graphqlClient } from "../../client";
import { graphql } from "../../graphql";
import { toDrupalLangcode } from "../locale";

const mainMenuQuery = graphql(`
  query DrupalMainMenu($langcode: String) {
    menu(name: MAIN, langcode: $langcode) {
      items {
        id
        title
        description
        url
        children {
          id
          title
          description
          url
        }
      }
    }
  }
`);

async function loadNavigation(
  locale: Locale,
  preview: boolean
): Promise<{ navigationItems: NavigationItem[] }> {
  const response = await graphqlClient(preview).query(mainMenuQuery, {
    langcode: toDrupalLangcode(locale),
  });

  if (response.error) {
    throw new Error("Failed to load the Drupal main menu", {
      cause: response.error,
    });
  }

  const navigationItems: NavigationItem[] =
    response.data?.menu?.items.map((item) => ({
      children: item.children.flatMap((child) =>
        child.url
          ? [
              {
                description: child.description ?? undefined,
                href: child.url,
                title: child.title,
              },
            ]
          : []
      ),
      href: item.url ?? undefined,
      title: item.title,
    })) ?? [];

  return { navigationItems };
}

async function getCachedNavigation(locale: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("menu");

  return await loadNavigation(locale, false);
}

export async function getNavigation(
  locale: Locale
): Promise<{ navigationItems: NavigationItem[] }> {
  const { isEnabled: preview } = await draftMode();
  return preview
    ? await loadNavigation(locale, true)
    : await getCachedNavigation(locale);
}
