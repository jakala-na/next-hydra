import type {
  NavigationItem,
  NavigationItemIcon,
} from "@repo/design-system/components/layout/navigation";
import type { Locale } from "@repo/i18n";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode, headers } from "next/headers";

import { graphqlClient } from "../../client";
import getLinkProps from "../../components/link";
import { TAGS } from "../../constants";
import { graphql } from "../../graphql";
import { transformLocale } from "../utils/transform-locale";

export const getMenuQuery = graphql(`
  query getMenu($locale: String!) {
    all_navigation(locale: $locale, fallback_locale: true) {
      items {
        system {
          uid
          content_type_uid
        }
        title
        main_navigation {
          items {
            label
            external_url
            internal_contentConnection {
              edges {
                node {
                  ... on LandingPage {
                    url
                  }
                }
              }
            }
            children {
              label
              description
              icon
              external_url
              internal_contentConnection {
                edges {
                  node {
                    ... on LandingPage {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

async function loadNavigation(
  locale: Locale,
  livePreviewHash?: string
): Promise<{ navigationItems: NavigationItem[] }> {
  const res = await graphqlClient(livePreviewHash).query(getMenuQuery, {
    locale: transformLocale(locale),
  });

  const mainNavigation =
    res.data?.all_navigation?.items?.[0]?.main_navigation?.items;

  const navigationItems =
    mainNavigation?.map((item) => {
      const link = getLinkProps(item);
      return {
        children:
          item?.children?.map((child) => {
            const childLink = getLinkProps(child);
            return {
              description: child?.description ?? "",
              href: childLink.url,
              // Assume the icon is a valid Lucide icon name.
              icon: child?.icon
                ? (child.icon as NavigationItemIcon)
                : undefined,
              title: childLink.label,
            };
          }) ?? [],
        href: link.url,
        title: link.label,
      };
    }) ?? [];

  return { navigationItems };
}

async function getCachedNavigation(locale: Locale) {
  "use cache";
  cacheTag(TAGS.menu);
  cacheLife("days");

  return await loadNavigation(locale);
}

export async function getNavigation(
  locale: Locale
): Promise<{ navigationItems: NavigationItem[] }> {
  const { isEnabled: preview } = await draftMode();

  if (!preview) {
    return await getCachedNavigation(locale);
  }

  const livePreviewHash = (await headers()).get("x-live-preview") ?? "";
  return await loadNavigation(locale, livePreviewHash);
}
