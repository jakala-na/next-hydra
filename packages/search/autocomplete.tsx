"use client";

import "@algolia/autocomplete-theme-classic/dist/theme.css";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import type { HTMLTemplate } from "@algolia/autocomplete-js";
import { createQuerySuggestionsPlugin } from "@algolia/autocomplete-plugin-query-suggestions";
import { useRouter } from "@repo/i18n/navigation";
import { Array as EffectArray, Order } from "effect";
import type { Route } from "next";
import { useEffect, useMemo, useRef } from "react";

import { autocompleteSearchHref } from "./autocomplete-routing";
import type { SearchAutocompleteRoutes } from "./autocomplete-routing";
import { createAutocompleteProxySearchClient } from "./client";
import { searchCollections } from "./collections";
import type { QuerySuggestionSearchHit } from "./contract";
import { decodeQuerySuggestionSearchHit } from "./contract";
import type { SearchCollection, SearchHit } from "./search-collection";

import styles from "./autocomplete.module.css";
import fieldStyles from "./search-field.module.css";

const QUERY_SUGGESTIONS_SOURCE_ID = "querySuggestionsPlugin";
const DIRECT_RESULT_LIMIT = 3;
const QUERY_SUGGESTION_LIMIT = 4;
const autocompleteCollections = EffectArray.sort(
  searchCollections,
  (left: SearchCollection, right: SearchCollection) =>
    Order.Number(left.autocompleteOrder, right.autocompleteOrder)
);

type KeywordSearchHit = QuerySuggestionSearchHit & {
  readonly __autocomplete_qsCategory?: string;
  readonly __exactQuery?: true;
};

type SearchAutocompleteItem = SearchHit | KeywordSearchHit;

type AutocompleteRequesterClient = Parameters<
  typeof getAlgoliaResults<SearchAutocompleteItem>
>[0]["searchClient"];

export interface SearchAutocompleteProps {
  readonly endpoint: string;
  readonly routes: SearchAutocompleteRoutes;
}

const toAutocompleteRequesterClient = (
  client: ReturnType<typeof createAutocompleteProxySearchClient>
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

const sectionHeading = (label: string, html: HTMLTemplate) => html`<h2
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
    () => createAutocompleteProxySearchClient(endpoint),
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
          header: ({ html }) => sectionHeading("Search results", html),
          item: ({ html, item }) => html`<a
            class="${styles.resultLink}"
            data-autocomplete-result-section="Search results"
            href="${autocompleteSearchHref(item.query, routes)}"
          >
            <span
              class="${styles.resultIcon} ${fieldStyles.searchIcon}"
              aria-hidden="true"
            ></span>
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
        clearButton: fieldStyles.clearButton,
        detachedCancelButton: styles.detachedCancelButton,
        detachedContainer: styles.detachedContainer,
        detachedSearchButton: styles.detachedSearchButton,
        detachedSearchButtonIcon: `${fieldStyles.searchIcon} ${styles.detachedSearchButtonIcon}`,
        detachedSearchButtonPlaceholder: styles.detachedSearchButtonPlaceholder,
        detachedSearchButtonQuery: styles.detachedSearchButtonQuery,
        form: fieldStyles.form,
        input: fieldStyles.input,
        inputWrapperSuffix: styles.inputWrapperSuffix,
        item: styles.item,
        loadingIndicator: styles.loadingIndicator,
        panel: styles.panel,
        panelLayout: styles.panelLayout,
        root: styles.root,
        source: styles.source,
        sourceHeader: styles.sourceHeader,
        submitButton: fieldStyles.searchButton,
      },
      container,
      detachedMediaQuery: "(max-width: 1023px)",
      getSources: ({ query }) => {
        const normalizedQuery = query.trim();
        if (normalizedQuery.length === 0) {
          return [];
        }

        return autocompleteCollections.map((collection) => ({
          getItemUrl: ({ item }: { item: SearchAutocompleteItem }) =>
            collection.autocomplete(item, routes).href,
          getItems: () =>
            getAlgoliaResults<SearchAutocompleteItem>({
              queries: [
                {
                  indexName: collection.indexName,
                  params: {
                    analytics: false,
                    attributesToRetrieve: [...collection.attributes],
                    clickAnalytics: false,
                    hitsPerPage: DIRECT_RESULT_LIMIT,
                    query: normalizedQuery,
                  },
                },
              ],
              searchClient: requesterClient,
            }),
          sourceId: collection.indexName,
          templates: {
            header: ({ html }: { html: HTMLTemplate }) =>
              sectionHeading(collection.autocompleteLabel, html),
            item: ({
              html,
              item,
            }: {
              html: HTMLTemplate;
              item: SearchAutocompleteItem;
            }) => {
              const result = collection.autocomplete(item, routes);
              return html`<a
                class="${styles.resultLink}"
                data-autocomplete-result-section="${collection.autocompleteLabel}"
                href="${result.href}"
              >
                ${result.image === undefined ? html`<span class="${styles.resultIcon}" aria-hidden="true">${collection.fallbackSymbol}</span>` : html`<img alt="${result.image.altText ?? ""}" class="${styles.resultImage}" height="40" src="${result.image.url}" width="40" />`}
                <span class="${styles.resultBody}">
                  <span class="${styles.resultTitle}">${result.title}</span>
                  <span class="${styles.resultMeta}"
                    >${result.description}</span
                  >
                </span>
              </a>`;
            },
          },
        }));
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
      placeholder: "Search",
      plugins: [querySuggestionsPlugin],
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `reshape` is the public Autocomplete.js source-ordering API.
      reshape: ({ sourcesBySourceId, state }) => {
        const keywords = sourcesBySourceId[QUERY_SUGGESTIONS_SOURCE_ID];
        const query = state.query.trim();
        const ordered = autocompleteCollections
          .map(({ indexName }) => sourcesBySourceId[indexName])
          .filter((source) => source !== undefined);
        if (keywords === undefined || query.length === 0) {
          return ordered;
        }
        const suggestions = keywords
          .getItems()
          .filter(
            (item) =>
              !(
                decodeQuerySuggestionSearchHit(
                  item
                ).query.toLocaleLowerCase() === query.toLocaleLowerCase()
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
        clearButtonTitle: "Clear search",
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
