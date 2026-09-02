"use client";

import "@algolia/autocomplete-theme-classic/dist/theme.css";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import type { HTMLTemplate } from "@algolia/autocomplete-js";
import { createQuerySuggestionsPlugin } from "@algolia/autocomplete-plugin-query-suggestions";
import { useRouter } from "@repo/i18n/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useRef } from "react";

import {
  autocompleteProductHref,
  autocompleteResourceHref,
  autocompleteSearchHref,
} from "./autocomplete-routing";
import type { SearchAutocompleteRoutes } from "./autocomplete-routing";
import { createProxySearchClient } from "./client";
import type {
  ProductSearchHit,
  QuerySuggestionSearchHit,
  ResourceSearchHit,
} from "./contract";
import { PRODUCT_HIT_ATTRIBUTES, RESOURCE_HIT_ATTRIBUTES } from "./contract";

import styles from "./autocomplete.module.css";

const CONTENT_SOURCE_ID = "content";
const PRODUCT_SOURCE_ID = "products";
const QUERY_SUGGESTIONS_SOURCE_ID = "querySuggestionsPlugin";
const DIRECT_RESULT_LIMIT = 3;
const QUERY_SUGGESTION_LIMIT = 4;

type KeywordSearchHit = QuerySuggestionSearchHit & {
  readonly __autocomplete_qsCategory?: string;
  readonly __exactQuery?: true;
};

type SearchAutocompleteItem =
  | ProductSearchHit
  | ResourceSearchHit
  | KeywordSearchHit;

type AutocompleteRequesterClient = Parameters<
  typeof getAlgoliaResults<SearchAutocompleteItem>
>[0]["searchClient"];

export interface SearchAutocompleteProps {
  readonly endpoint: string;
  readonly routes: SearchAutocompleteRoutes;
}

const toAutocompleteRequesterClient = (
  client: ReturnType<typeof createProxySearchClient>
): AutocompleteRequesterClient =>
  // @ts-expect-error -- The preset declares the complete Algolia client even
  // though its requester only calls search() and reads transporter headers.
  client;

const exactQueryHit = (query: string): KeywordSearchHit => ({
  __exactQuery: true,
  nb_words: query.split(/\s+/u).length,
  objectID: `exact-query:${query}`,
  popularity: 0,
  query,
});

const keywordLabel = (
  item: Pick<KeywordSearchHit, "__exactQuery" | "query">
): string =>
  item.__exactQuery === true ? `Search for "${item.query}"` : item.query;

const requireProductHit = (item: SearchAutocompleteItem): ProductSearchHit => {
  if ("productCard" in item) {
    return item;
  }
  throw new Error("The Products autocomplete source returned an invalid hit");
};

const requireResourceHit = (
  item: SearchAutocompleteItem
): ResourceSearchHit => {
  if ("resourceCard" in item) {
    return item;
  }
  throw new Error("The Content autocomplete source returned an invalid hit");
};

const sectionHeading = (
  label: "Content" | "Keywords" | "Products",
  html: HTMLTemplate
) => html`<h2
  class="${styles.sectionHeading}"
  data-autocomplete-section="${label}"
>
  ${label}
</h2>`;

export function SearchAutocomplete({
  endpoint,
  routes,
}: SearchAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const proxyClient = useMemo(
    () => createProxySearchClient(endpoint),
    [endpoint]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const querySuggestionsPlugin = createQuerySuggestionsPlugin({
      getSearchParams: () => ({
        analytics: false,
        clickAnalytics: false,
        hitsPerPage: QUERY_SUGGESTION_LIMIT,
      }),
      indexName: "query-suggestions",
      searchClient: proxyClient,
      transformSource: ({ source }) => ({
        ...source,
        getItemUrl: ({ item }) => autocompleteSearchHref(item.query, routes),
        templates: {
          ...source.templates,
          header: ({ html }) => sectionHeading("Keywords", html),
          item: ({ html, item }) => html`<a
            class="${styles.resultLink}"
            data-autocomplete-result-section="Keywords"
            href="${autocompleteSearchHref(item.query, routes)}"
          >
            <span class="${styles.resultIcon}" aria-hidden="true">⌕</span>
            <span class="${styles.resultBody}">
              <span class="${styles.resultTitle}"> ${keywordLabel(item)} </span>
              <span class="${styles.resultMeta}">Search all results</span>
            </span>
          </a>`,
        },
      }),
    });
    const requesterClient = toAutocompleteRequesterClient(proxyClient);

    const instance = autocomplete<SearchAutocompleteItem>({
      classNames: {
        detachedSearchButton: styles.detachedSearchButton,
        detachedSearchButtonPlaceholder: styles.detachedSearchButtonPlaceholder,
        form: styles.form,
        input: styles.input,
        item: styles.item,
        panel: styles.panel,
        panelLayout: styles.panelLayout,
        root: styles.root,
        source: styles.source,
        sourceHeader: styles.sourceHeader,
      },
      container,
      detachedMediaQuery: "(max-width: 1023px)",
      getSources: ({ query }) => {
        const normalizedQuery = query.trim();
        if (normalizedQuery.length === 0) {
          return [];
        }

        return [
          {
            getItemUrl: ({ item }) =>
              autocompleteResourceHref(requireResourceHit(item), routes),
            getItems: () =>
              getAlgoliaResults<SearchAutocompleteItem>({
                queries: [
                  {
                    indexName: "resources",
                    params: {
                      analytics: false,
                      attributesToRetrieve: [...RESOURCE_HIT_ATTRIBUTES],
                      clickAnalytics: false,
                      hitsPerPage: DIRECT_RESULT_LIMIT,
                      query: normalizedQuery,
                    },
                  },
                ],
                searchClient: requesterClient,
              }),
            sourceId: CONTENT_SOURCE_ID,
            templates: {
              header: ({ html }) => sectionHeading("Content", html),
              item: ({ html, item }) => {
                const resource = requireResourceHit(item);
                const { image } = resource.resourceCard;
                return html`<a
                  class="${styles.resultLink}"
                  data-autocomplete-result-section="Content"
                  href="${autocompleteResourceHref(resource, routes)}"
                >
                  ${
                    image === undefined
                      ? html`<span
                          class="${styles.resultIcon}"
                          aria-hidden="true"
                          >§</span
                        >`
                      : html`<img
                          alt="${image.altText}"
                          class="${styles.resultImage}"
                          height="40"
                          src="${image.url}"
                          width="40"
                        />`
                  }
                  <span class="${styles.resultBody}">
                    <span class="${styles.resultTitle}"
                      >${resource.resourceCard.title}</span
                    >
                    <span class="${styles.resultMeta}"
                      >${resource.resourceCard.summary}</span
                    >
                  </span>
                </a>`;
              },
            },
          },
          {
            getItemUrl: ({ item }) =>
              autocompleteProductHref(requireProductHit(item), routes),
            getItems: () =>
              getAlgoliaResults<SearchAutocompleteItem>({
                queries: [
                  {
                    indexName: "products",
                    params: {
                      analytics: false,
                      attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
                      clickAnalytics: false,
                      hitsPerPage: DIRECT_RESULT_LIMIT,
                      query: normalizedQuery,
                    },
                  },
                ],
                searchClient: requesterClient,
              }),
            sourceId: PRODUCT_SOURCE_ID,
            templates: {
              header: ({ html }) => sectionHeading("Products", html),
              item: ({ html, item }) => {
                const product = requireProductHit(item);
                const image = product.productCard.featuredImage;
                return html`<a
                  class="${styles.resultLink}"
                  data-autocomplete-result-section="Products"
                  href="${autocompleteProductHref(product, routes)}"
                >
                  ${
                    image === undefined
                      ? html`<span
                          class="${styles.resultIcon}"
                          aria-hidden="true"
                          >◇</span
                        >`
                      : html`<img
                          alt="${image.altText ?? ""}"
                          class="${styles.resultImage}"
                          height="40"
                          src="${image.url}"
                          width="40"
                        />`
                  }
                  <span class="${styles.resultBody}">
                    <span class="${styles.resultTitle}"
                      >${product.productCard.title}</span
                    >
                    <span class="${styles.resultMeta}"
                      >${product.categories[0]?.label ?? "Product"}</span
                    >
                  </span>
                </a>`;
              },
            },
          },
        ];
      },
      insights: false,
      navigator: {
        navigate: ({ itemUrl }) => {
          // SAFETY: Every source constructs itemUrl through the localized
          // routing helpers above; Autocomplete.js widens it back to string.
          router.push(itemUrl as Route);
        },
      },
      onSubmit: ({ state }) => {
        const query = state.query.trim();
        if (query.length > 0) {
          router.push(autocompleteSearchHref(query, routes));
        }
      },
      panelPlacement: "input-wrapper-width",
      placeholder: "Search products and resources",
      plugins: [querySuggestionsPlugin],
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `reshape` is the public Autocomplete.js source-ordering API.
      reshape: ({ sourcesBySourceId, state }) => {
        const content = sourcesBySourceId[CONTENT_SOURCE_ID];
        const products = sourcesBySourceId[PRODUCT_SOURCE_ID];
        const keywords = sourcesBySourceId[QUERY_SUGGESTIONS_SOURCE_ID];
        const query = state.query.trim();
        const ordered = [content, products].filter(
          (source) => source !== undefined
        );
        if (keywords === undefined || query.length === 0) {
          return ordered;
        }
        const suggestions = keywords
          .getItems()
          .filter(
            (item) =>
              !(
                "query" in item &&
                item.query.toLocaleLowerCase() === query.toLocaleLowerCase()
              )
          );
        return [
          ...ordered,
          {
            ...keywords,
            getItems: () => [exactQueryHit(query), ...suggestions],
          },
        ];
      },
      translations: {
        detachedSearchButtonTitle: "Search",
        submitButtonTitle: "Search",
      },
    });

    return () => {
      instance.destroy();
    };
  }, [proxyClient, router, routes]);

  return <div className={styles.container} ref={containerRef} />;
}
