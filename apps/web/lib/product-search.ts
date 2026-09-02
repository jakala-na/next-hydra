import "server-only";
import { ProductDiscovery } from "@repo/commerce/product";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import type { Locale } from "@repo/i18n";
import { searchProvider } from "@repo/search-provider/provider";
import type {
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchProvider,
} from "@repo/search/contract";
import { isProductIndexAlias } from "@repo/search/contract";
import { Effect } from "effect";
import { cacheLife, cacheTag } from "next/cache";

import { NextCommerce } from "./commerce-runtime";

export const resolveProductSearchAudience = async (
  locale: Locale
): Promise<SearchAudience> =>
  await NextCommerce.runPromise(
    Effect.gen(function* () {
      const { store } = yield* CommerceContext;
      const productDiscovery = yield* ProductDiscovery;
      const productAudience = yield* productDiscovery.searchAudience();

      return {
        locale: store.locale,
        product: {
          currency: store.currency,
          customerSegmentKeys: productAudience.customerSegmentKeys,
          distributionChannelKeys: productAudience.distributionChannelKeys,
          storeKey: store.storeKey,
          supplyChannelKeys: productAudience.supplyChannelKeys,
        },
      };
    }).pipe(NextCommerce.provide(locale))
  );

export const resolveSearchAudience = async (
  locale: Locale,
  batch: SearchBatch
): Promise<SearchAudience> =>
  batch.some(({ indexName }) => isProductIndexAlias(indexName))
    ? await resolveProductSearchAudience(locale)
    : { locale };

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

/**
 * Shares search results only when the complete provider-neutral
 * audience and InstantSearch request batch match. Abort signals stay outside
 * the serialized cache key.
 */
export const cachedSearchProvider: SearchProvider = {
  search: async (batch, audience, signal) => {
    signal?.throwIfAborted();
    const result = await searchResults(batch, audience);
    signal?.throwIfAborted();
    return result;
  },
};
