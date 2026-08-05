import type { Locale } from "@repo/i18n";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { graphqlClient } from "../client";
import { graphql } from "../graphql";
import { getLandingPageCacheTag } from "../lib/cache-tags";
import type {
  DrupalGraphqlPreviewContext,
  DrupalPreviewContext,
} from "../lib/preview-context";
import { getDrupalPreviewContext } from "../lib/preview-session";
import PageRenderer, { isPageKey } from "./page-renderer";

const routeQuery = graphql(
  `
    query DrupalRoute($path: String!, $revision: ID) {
      route(path: $path, revision: $revision) {
        __typename
        ... on RouteInternal {
          entity {
            __typename
            ... on NodeInterface {
              id
            }
            ...DrupalLandingPage
          }
        }
      }
    }
  `,
  [...PageRenderer.fragments]
);

const pagePreviewQuery = graphql(
  `
    query DrupalPagePreview($id: ID!, $token: String!) {
      preview(id: $id, token: $token) {
        __typename
        ... on NodeInterface {
          id
        }
        ...DrupalLandingPage
      }
    }
  `,
  [...PageRenderer.fragments]
);

const LEADING_SLASHES = /^\/+/;

export function normalizeDrupalPath(path: string): string {
  if (path === "/") {
    return path;
  }
  return `/${path.replace(LEADING_SLASHES, "")}`;
}

async function getRouteEntity(
  path: string,
  revision: string | null = null,
  preview = false
) {
  const response = await graphqlClient(preview).query(routeQuery, {
    path: normalizeDrupalPath(path),
    revision,
  });

  if (response.error) {
    throw new Error("Failed to load the Drupal route", {
      cause: response.error,
    });
  }

  const route = response.data?.route;
  return route?.__typename === "RouteInternal"
    ? (route.entity ?? undefined)
    : undefined;
}

async function getCachedRouteEntity(path: string) {
  "use cache";

  const entity = await getRouteEntity(path);
  if (!(entity && isPageKey(entity.__typename))) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return;
  }

  cacheLife("hours");
  cacheTag(getLandingPageCacheTag(entity));
  return entity;
}

async function getPagePreview(context: DrupalGraphqlPreviewContext) {
  const response = await graphqlClient(true).query(pagePreviewQuery, {
    id: context.id,
    token: context.token,
  });

  if (response.error) {
    throw new Error("Failed to load the Drupal page preview", {
      cause: response.error,
    });
  }

  const preview = response.data?.preview;
  return preview && isPageKey(preview.__typename) ? preview : undefined;
}

function getPageForContext(
  path: string,
  context: DrupalPreviewContext | undefined
) {
  if (context?.path !== path) {
    return getRouteEntity(path);
  }

  return context.kind === "graphql"
    ? getPagePreview(context)
    : getRouteEntity(path, context.revision, true);
}

export async function Page(props: { url: string; locale: Locale }) {
  const { locale, url } = props;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const { isEnabled: preview } = await draftMode();
  const previewContext = preview ? await getDrupalPreviewContext() : undefined;
  const normalizedPath = normalizeDrupalPath(url);
  const entity = preview
    ? await getPageForContext(normalizedPath, previewContext)
    : await getCachedRouteEntity(normalizedPath);

  if (!(entity && isPageKey(entity.__typename))) {
    notFound();
  }

  return <PageRenderer data={entity} locale={locale} />;
}
