import "server-only";
import { ProductDiscovery } from "@repo/commerce/product";
import { NextCommerce } from "@repo/commerce/runtime";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import type { Locale } from "@repo/i18n";
import { Effect } from "effect";

import type { SearchAudience } from "./contract";

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
          priceAudienceIds: productAudience.priceAudienceIds,
          storeKey: store.storeKey,
        },
      };
    }).pipe(NextCommerce.provide(locale))
  );
