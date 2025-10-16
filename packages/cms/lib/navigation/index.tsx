import getLinkProps from "@repo/cms/components/link";
import type {
  NavigationItem,
  NavigationItemIcon,
} from "@repo/design-system/components/layout/navigation";
import type { Locale } from "@repo/i18n";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { graphqlClient } from "../../client";
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

export async function getNavigation(
  locale: Locale,
  livePreviewHash?: string
): Promise<{ navigationItems: NavigationItem[] }> {
  "use cache";
  cacheTag(TAGS.menu);
  cacheLife("days");

  const res = await graphqlClient(livePreviewHash).query(getMenuQuery, {
    locale: transformLocale(locale),
  });

  const mainNavigation =
    res.data?.all_navigation?.items?.[0]?.main_navigation?.items;

  const navigationItems =
    mainNavigation?.map((item) => {
      const link = getLinkProps(item);
      return {
        title: link.label,
        href: link.url,
        children:
          item?.children?.map((child) => {
            const childLink = getLinkProps(child);
            return {
              title: childLink.label,
              href: childLink.url,
              description: child?.description ?? "",
              // Assume the icon is a valid Lucide icon name.
              icon: child?.icon
                ? (child.icon as NavigationItemIcon)
                : undefined,
            };
          }) ?? [],
      };
    }) ?? [];

  return { navigationItems };
}
