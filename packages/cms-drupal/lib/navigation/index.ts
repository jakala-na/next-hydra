import type { NavigationItem } from "@repo/design-system/components/layout/navigation";
import type { Locale } from "@repo/i18n";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { graphqlClient } from "../../client";
import { graphql } from "../../graphql";

const mainMenuQuery = graphql(`
  query DrupalMainMenu {
    menu(name: MAIN) {
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
  preview: boolean
): Promise<{ navigationItems: NavigationItem[] }> {
  const response = await graphqlClient(preview).query(mainMenuQuery, {});

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

async function getCachedNavigation() {
  "use cache";
  cacheLife("days");
  cacheTag("menu");

  return await loadNavigation(false);
}

export async function getNavigation(
  _locale: Locale,
  _livePreviewHash?: string
): Promise<{ navigationItems: NavigationItem[] }> {
  const { isEnabled: preview } = await draftMode();
  return preview ? loadNavigation(true) : getCachedNavigation();
}
