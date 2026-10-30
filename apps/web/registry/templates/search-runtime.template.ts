import "server-only";
import { createContentSearchProjection } from "@repo/cms/search";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import { createSearchProvider } from "@repo/search-provider/composition";
import type {
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchProvider,
} from "@repo/search/contract";
/*{% echo imports %}*/
import { makeSearchRuntime } from "@repo/search/runtime/make-search-runtime";
import type { SearchClientConfiguration } from "@repo/search/runtime/make-search-runtime";
import { cacheLife, cacheTag } from "next/cache";

const searchProvider = createSearchProvider({
  contentProjection: createContentSearchProjection,
});

const searchResults = async (
  batch: SearchBatch,
  audience: SearchAudience
): Promise<SearchBatchResult> => {
  "use cache";
  cacheLife("minutes");
  cacheTag("search", `search:${audience.locale}`);
  if (audience.product !== undefined) {
    cacheTag(
      "product-search",
      `product-search:${audience.product.storeKey}:${audience.locale}`
    );
  }

  return await searchProvider.search(batch, audience);
};

const cachedSearchProvider: SearchProvider = {
  search: async (batch, audience, signal) => {
    signal?.throwIfAborted();
    const result = await searchResults(batch, audience);
    signal?.throwIfAborted();
    return result;
  },
};

function getClientConfiguration(locale: Locale): SearchClientConfiguration {
  /*{% if enabled.productRoutes %}*/
  /*{% echo slots.productRoutes | prepend: 'const commerceRoutes = ' | append: '(locale);' %}*/
  /*{% endif %}*/
  return {
    autocompleteRoutes: {
      contentPathPrefix: getPathname({ href: "/", locale }),
      /*{% if enabled.productRoutes %}*/
      productPathPrefix: commerceRoutes.productPathPrefix,
      /*{% endif %}*/
      searchPath: getPathname({ href: "/search", locale }),
    },
    endpoint: `/api/search/${locale}`,
    /*{% if enabled.productRoutes %}*/
    productListingPath: commerceRoutes.productListingPath,
    /*{% endif %}*/
  };
}

export const searchRuntime = makeSearchRuntime({
  getClientConfiguration,
  provider: cachedSearchProvider,
  /*{% if enabled.productAudience %}*/
  /*{% echo slots.productAudience | prepend: 'resolveProductAudience: ' | append: ',' %}*/
  /*{% endif %}*/
});
