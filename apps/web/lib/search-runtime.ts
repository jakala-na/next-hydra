import "server-only";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import { searchProvider } from "@repo/search-provider/provider";
import type {
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchProvider,
} from "@repo/search/contract";
import { resolveProductSearchAudience } from "@repo/search/product-search-audience";
import { makeSearchRuntime } from "@repo/search/runtime/make-search-runtime";
import type { SearchClientConfiguration } from "@repo/search/runtime/make-search-runtime";
import { cacheLife, cacheTag } from "next/cache";

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

const getClientConfiguration = (locale: Locale): SearchClientConfiguration => ({
  autocompleteRoutes: {
    productPathPrefix: getPathname({ href: "/product", locale }),
    resourcePathPrefix: getPathname({ href: "/", locale }),
    searchPath: getPathname({ href: "/search", locale }),
  },
  endpoint: `/api/search/${locale}`,
});

export const searchRuntime = makeSearchRuntime({
  getClientConfiguration,
  provider: cachedSearchProvider,
  resolveProductAudience: resolveProductSearchAudience,
});
