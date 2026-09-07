import type { Locale } from "@repo/i18n";

import type { SearchAutocompleteRoutes } from "../autocomplete-routing";
import type { SearchAudience, SearchBatch, SearchProvider } from "../contract";
import { requiresProductSearchAudience } from "../contract";

export interface SearchClientConfiguration {
  readonly autocompleteRoutes: SearchAutocompleteRoutes;
  readonly endpoint: string;
  readonly productListingPath: string;
}

export interface SearchRuntime extends SearchProvider {
  readonly getClientConfiguration: (
    locale: Locale
  ) => SearchClientConfiguration;
  readonly resolveAudience: (
    locale: Locale,
    batch: SearchBatch
  ) => Promise<SearchAudience>;
  readonly resolveProductAudience: (locale: Locale) => Promise<SearchAudience>;
}

export interface SearchRuntimeOptions {
  readonly getClientConfiguration: (
    locale: Locale
  ) => SearchClientConfiguration;
  readonly provider: SearchProvider;
  readonly resolveProductAudience: (locale: Locale) => Promise<SearchAudience>;
}

export const makeSearchRuntime = ({
  getClientConfiguration,
  provider,
  resolveProductAudience,
}: SearchRuntimeOptions): SearchRuntime => ({
  getClientConfiguration,
  resolveAudience: async (locale, batch) =>
    batch.some(({ indexName }) => requiresProductSearchAudience(indexName))
      ? await resolveProductAudience(locale)
      : { locale },
  resolveProductAudience,
  search: async (batch, audience, signal) =>
    await provider.search(batch, audience, signal),
});
