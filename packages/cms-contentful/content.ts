import type { Document } from "@contentful/rich-text-types";

export type ContentfulSys = {
  readonly id: string;
  readonly publishedAt?: string | null;
};

export type ContentfulAsset = {
  readonly description?: string | null;
  readonly height?: number | null;
  readonly title?: string | null;
  readonly url?: string | null;
  readonly width?: number | null;
};

type ContentfulCollection<Item> = {
  readonly items: readonly (Item | null)[];
};

export type ContentfulCallToAction = {
  readonly externalUrl?: string | null;
  readonly internalContent?: {
    readonly __typename: "Article" | "LandingPage";
    readonly slug?: string | null;
  } | null;
  readonly label: string;
  readonly sys: ContentfulSys;
};

export type ContentfulHero = {
  readonly __typename: "Hero";
  readonly actionsCollection?: ContentfulCollection<ContentfulCallToAction> | null;
  readonly description: string;
  readonly heading: string;
  readonly image?: ContentfulAsset | null;
  readonly sys: ContentfulSys;
  readonly tagline?: string | null;
};

export type ContentfulArticle = {
  readonly __typename: "Article";
  readonly body?: {
    readonly json: Document;
  } | null;
  readonly image?: ContentfulAsset | null;
  readonly slug: string;
  readonly summary: string;
  readonly sys: ContentfulSys;
  readonly title: string;
};

export type ContentfulFeaturedArticles = {
  readonly __typename: "FeaturedArticles";
  readonly articlesCollection: ContentfulCollection<ContentfulArticle>;
  readonly description?: string | null;
  readonly heading: string;
  readonly sys: ContentfulSys;
};

export type ContentfulDynamicProductCollection = {
  readonly __typename: "DynamicProductCollection";
  readonly description?: string | null;
  readonly heading?: string | null;
  readonly productCategory?: string | null;
  readonly sys: ContentfulSys;
};

export type ContentfulComponent =
  | ContentfulDynamicProductCollection
  | ContentfulFeaturedArticles
  | ContentfulHero;

export type ContentfulLandingPage = {
  readonly __typename: "LandingPage";
  readonly componentsCollection?: ContentfulCollection<ContentfulComponent> | null;
  readonly displayTitle?: string | null;
  readonly hideDisplayTitle?: boolean | null;
  readonly slug: string;
  readonly sys: ContentfulSys;
  readonly title: string;
};

export type ContentfulPage = ContentfulArticle | ContentfulLandingPage;

export type ContentfulPageQueryResult = {
  readonly articleCollection: ContentfulCollection<ContentfulArticle>;
  readonly landingPageCollection: ContentfulCollection<ContentfulLandingPage>;
};

export const CONTENTFUL_PAGE_QUERY = `
  query ContentfulPage($slug: String!, $locale: String!, $preview: Boolean!) {
    landingPageCollection(
      limit: 1
      locale: $locale
      preview: $preview
      where: { slug: $slug }
    ) {
      items {
        __typename
        sys {
          id
          publishedAt
        }
        title
        slug
        displayTitle
        hideDisplayTitle
        componentsCollection(limit: 20) {
          items {
            __typename
            ... on Hero {
              sys {
                id
              }
              tagline
              heading
              description
              image {
                url
                width
                height
                title
                description
              }
              actionsCollection(limit: 2) {
                items {
                  sys {
                    id
                  }
                  label
                  externalUrl
                  internalContent {
                    __typename
                    ... on Article {
                      slug
                    }
                    ... on LandingPage {
                      slug
                    }
                  }
                }
              }
            }
            ... on FeaturedArticles {
              sys {
                id
              }
              heading
              description
              articlesCollection(limit: 3) {
                items {
                  __typename
                  sys {
                    id
                    publishedAt
                  }
                  title
                  slug
                  summary
                  image {
                    url
                    width
                    height
                    title
                    description
                  }
                }
              }
            }
            ... on DynamicProductCollection {
              sys {
                id
              }
              heading
              description
              productCategory
            }
          }
        }
      }
    }
    articleCollection(
      limit: 1
      locale: $locale
      preview: $preview
      where: { slug: $slug }
    ) {
      items {
        __typename
        sys {
          id
          publishedAt
        }
        title
        slug
        summary
        image {
          url
          width
          height
          title
          description
        }
        body {
          json
        }
      }
    }
  }
`;

const pageFromCollection = <Page>(
  collection: ContentfulCollection<Page>
): Page | undefined =>
  collection.items.find((item) => item !== null) ?? undefined;

export const normalizeContentfulSlug = (path: string): string =>
  path.replaceAll(/^\/+|\/+$/gu, "");

export function contentfulPageFrom(
  result: ContentfulPageQueryResult
): ContentfulPage | undefined {
  return (
    pageFromCollection(result.landingPageCollection) ??
    pageFromCollection(result.articleCollection)
  );
}
