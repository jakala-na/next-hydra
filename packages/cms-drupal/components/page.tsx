import {
  fetchPage as fetchDraftAwareCanvasPage,
  isPageRedirect,
} from "@drupal-canvas/headless-next";
import { fetchPage as fetchPublishedCanvasPage } from "@drupal-canvas/headless/server";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import type { Locale } from "@repo/i18n";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import type { Route } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { graphqlClient } from "../client";
import { graphql } from "../graphql";
import { keys } from "../keys";
import { getCanvasCachePolicy } from "../lib/canvas-cacheability";
import { toDrupalLangcode, toDrupalPath } from "../lib/locale";
import type {
  DrupalGraphqlPreviewContext,
  DrupalPreviewContext,
} from "../lib/preview-context";
import { getDrupalPreviewContext } from "../lib/preview-session";
import { CanvasComponentTree } from "./canvas-component-tree";
import PageRenderer, { isPageKey } from "./page-renderer";

const routeQuery = graphql(
  `
    query DrupalRoute($path: String!, $revision: ID, $langcode: String) {
      route(path: $path, revision: $revision, langcode: $langcode) {
        __typename
        ... on RouteInternal {
          entity {
            __typename
            ... on NodeInterface {
              id
            }
            ...DrupalArticlePage
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
    query DrupalPagePreview($id: ID!, $token: String!, $langcode: String) {
      preview(id: $id, token: $token, langcode: $langcode) {
        __typename
        ... on NodeInterface {
          id
        }
        ...DrupalArticlePage
        ...DrupalLandingPage
      }
    }
  `,
  [...PageRenderer.fragments]
);

const LEADING_SLASHES = /^\/+/;
const MOVED_PERMANENTLY_STATUS = 301;
const PERMANENT_REDIRECT_STATUS = 308;

export function normalizeDrupalPath(path: string): string {
  if (path === "/") {
    return path;
  }
  return `/${path.replace(LEADING_SLASHES, "")}`;
}

async function getRouteEntity(
  path: string,
  locale: Locale,
  revision: string | null = null,
  preview = false
) {
  const response = await graphqlClient(preview).query(routeQuery, {
    langcode: toDrupalLangcode(locale),
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

async function getCachedRouteEntity(path: string, locale: Locale) {
  "use cache";

  const entity = await getRouteEntity(path, locale);
  if (!(entity && isPageKey(entity.__typename))) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return;
  }

  cacheLife("hours");
  cacheTag(...PageRenderer.getCacheTags(entity));
  return entity;
}

async function getCachedCanvasPage(path: string) {
  "use cache";

  const config = keys();
  const page = await fetchPublishedCanvasPage(path, {
    baseUrl: config.CANVAS_SITE_URL ?? config.DRUPAL_BASE_URL,
  });

  if (!(page && !isPageRedirect(page))) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return page;
  }

  const policy = getCanvasCachePolicy(page.cacheability);
  if (!policy) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return page;
  }

  cacheLife(policy.life);
  if (policy.tags.length > 0) {
    cacheTag(...policy.tags);
  }
  return page;
}

async function getPagePreview(
  context: DrupalGraphqlPreviewContext,
  locale: Locale
) {
  const response = await graphqlClient(true).query(pagePreviewQuery, {
    id: context.id,
    langcode: toDrupalLangcode(locale),
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

async function getPageForContext(
  path: string,
  context: DrupalPreviewContext | undefined,
  locale: Locale
) {
  if (context?.path !== toDrupalPath(path, locale)) {
    return await getRouteEntity(path, locale);
  }

  return context.kind === "graphql"
    ? await getPagePreview(context, locale)
    : await getRouteEntity(path, locale, context.revision, true);
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
  const drupalPath = toDrupalPath(normalizedPath, locale);
  const canvasPage = preview
    ? await fetchDraftAwareCanvasPage(drupalPath)
    : await getCachedCanvasPage(drupalPath);

  if (canvasPage && isPageRedirect(canvasPage)) {
    const destination = canvasPage.redirect.url as Route;
    if (
      canvasPage.redirect.statusCode === MOVED_PERMANENTLY_STATUS ||
      canvasPage.redirect.statusCode === PERMANENT_REDIRECT_STATUS
    ) {
      permanentRedirect(destination);
    }
    redirect(destination);
  }

  if (canvasPage?.route.managedByCanvas) {
    return (
      <ArchitectureBoundary
        cacheProfile={
          preview ? "Canvas draft session" : "Drupal cacheability metadata"
        }
        component="server"
        description="Drupal Canvas resolves the stored component tree on the server while registry entries opt into client boundaries as needed."
        layer="route"
        layerLabel="Canvas component tree"
        name="DrupalCanvasPageRoute"
        rendering={preview ? "dynamic" : "static"}
        source="cms"
        sourceLabel="Drupal Canvas"
      >
        <CanvasComponentTree tree={canvasPage.content} />
      </ArchitectureBoundary>
    );
  }

  const entity = preview
    ? await getPageForContext(normalizedPath, previewContext, locale)
    : await getCachedRouteEntity(normalizedPath, locale);

  if (!(entity && isPageKey(entity.__typename))) {
    notFound();
  }

  return (
    <ArchitectureBoundary
      cacheProfile={preview ? "preview cache bypass" : "hours"}
      cacheTags={preview ? [] : PageRenderer.getCacheTags(entity)}
      component="server"
      description="One route(path:) query resolves the Drupal entity and selects its page template by __typename."
      layer="route"
      layerLabel="CMS route and page registry"
      name="DrupalPageRoute"
      rendering={preview ? "dynamic" : "cached"}
      source="cms"
      sourceLabel="Drupal CMS"
    >
      <PageRenderer data={entity} locale={locale} />
    </ArchitectureBoundary>
  );
}
