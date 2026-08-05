import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { graphqlClient } from "../../client";
import { graphql } from "../../graphql";
import ComponentRenderer from "../component-renderer";

const landingPageQuery = graphql(
  `
    query DrupalLandingPage($path: String!, $revision: ID) {
      route(path: $path, revision: $revision) {
        __typename
        ... on RouteInternal {
          entity {
            __typename
            ... on NodeLandingPage {
              id
              title
              displayTitle
              hideDisplayTitle
              components {
                __typename
                ... on ParagraphInterface {
                  id
                }
                ...DrupalHeroSection
                ...DrupalDynamicProductCollection
              }
            }
          }
        }
      }
    }
  `,
  [...ComponentRenderer.fragments]
);

const LEADING_SLASHES = /^\/+/;

export function normalizeDrupalPath(path: string): string {
  if (path === "/") {
    return path;
  }
  return `/${path.replace(LEADING_SLASHES, "")}`;
}

async function getLandingPage(path: string, preview: boolean) {
  const response = await graphqlClient(preview).query(landingPageQuery, {
    path: normalizeDrupalPath(path),
    revision: preview ? "latest" : null,
  });

  if (response.error) {
    throw new Error("Failed to load the Drupal landing page", {
      cause: response.error,
    });
  }

  const route = response.data?.route;
  if (route?.__typename !== "RouteInternal") {
    return;
  }

  const { entity } = route;
  if (entity?.__typename !== "NodeLandingPage") {
    return;
  }

  return entity;
}

export async function LandingPage(props: { url: string; locale: Locale }) {
  const { locale, url } = props;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const { isEnabled: preview } = await draftMode();
  const page = await getLandingPage(url, preview);
  if (!page) {
    notFound();
  }

  return (
    <>
      {page.displayTitle ? (
        <h1 className={cn(page.hideDisplayTitle === true && "hidden")}>
          {page.displayTitle}
        </h1>
      ) : null}
      <ComponentRenderer data={page.components} locale={locale} />
    </>
  );
}
