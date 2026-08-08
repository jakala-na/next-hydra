import { fetchPage, isPageRedirect } from "@drupal-canvas/headless-next";
import { CanvasComponentTree } from "@drupal-canvas/headless-next/CanvasComponentTree";
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
    query DrupalPagePreview($id: ID!, $token: String!) {
      preview(id: $id, token: $token) {
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
  cacheTag(...PageRenderer.getCacheTags(entity));
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
  const canvasPage = await fetchPage(normalizedPath);

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
        cacheProfile={preview ? "Canvas draft session" : undefined}
        component="client"
        description="Drupal Canvas resolves and renders the stored component tree through the generated registry."
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
    ? await getPageForContext(normalizedPath, previewContext)
    : await getCachedRouteEntity(normalizedPath);

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
