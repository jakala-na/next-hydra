import type { ArticleTeaser } from "@repo/design-system/components/cms/article-card";
import type { Locale } from "@repo/i18n";
import { gql } from "@urql/core";
import { cacheLife, cacheTag } from "next/cache";

import { graphqlClient } from "../client";
import {
  articleTeaserFragment,
  toArticleTeaser,
} from "../components/pages/article";
import type { FragmentOf } from "../graphql";
import { toDrupalLangcode } from "./locale";

type LatestArticlesQuery = {
  nodeArticles: {
    nodes: FragmentOf<typeof articleTeaserFragment>[];
  };
};

type LatestArticlesQueryVariables = {
  langcode: string;
  limit: number;
};

export const latestArticlesQuery = gql<
  LatestArticlesQuery,
  LatestArticlesQueryVariables
>`
  query DrupalLatestArticles($limit: Int!, $langcode: String) {
    nodeArticles(
      first: $limit
      langcode: $langcode
      reverse: true
      sortKey: CREATED_AT
    ) {
      nodes {
        ...DrupalArticleTeaser
      }
    }
  }
  ${articleTeaserFragment}
`;

export async function fetchLatestArticles(
  limit: number,
  locale: Locale
): Promise<ArticleTeaser[]> {
  const response = await graphqlClient().query(latestArticlesQuery, {
    langcode: toDrupalLangcode(locale),
    limit,
  });

  if (response.error) {
    throw new Error("Failed to load the latest Drupal articles", {
      cause: response.error,
    });
  }

  return (response.data?.nodeArticles.nodes ?? []).flatMap((article) => {
    const teaser = toArticleTeaser(article, locale);
    return teaser ? [teaser] : [];
  });
}

export async function getLatestArticles(
  limit: number,
  locale: Locale
): Promise<ArticleTeaser[]> {
  "use cache";

  const articles = await fetchLatestArticles(limit, locale);
  cacheLife("hours");
  cacheTag("node_list:article");
  return articles;
}
