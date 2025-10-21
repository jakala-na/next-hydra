import { type FragmentOf, graphql, readFragment } from "@repo/commerce/graphql";
import type { ProductTypeKey } from "@repo/commerce/lib/product/mappers/attributes";
import { reshapeProductAttributes } from "@repo/commerce/lib/product/mappers/attributes";
import {
  productSearchVariantAvailabilityWithChannelsFragment,
  reshapeProductSearchVariantAvailability,
} from "@repo/commerce/lib/product/mappers/availability";
import {
  productPriceSearchFragment,
  reshapePriceFromSearch,
} from "@repo/commerce/lib/product/mappers/price";
import type { ProductSearchVariant } from "@repo/commerce/lib/types";
import type { Locale } from "@repo/i18n/types";

export const productSearchVariantFragment = graphql(
  `
  fragment ProductSearchVariant on ProductSearchVariant {
    id
    sku
    images {
      url
      label
    }
    attributesRaw {
      name
      value
    }
    price(currency: $currency, channelId: $distributionChannelId) {
      ...ProductPriceSearch
    }
    availability {
      ...ProductSearchVariantAvailabilityWithChannels
    }
  }
`,
  [
    productPriceSearchFragment,
    productSearchVariantAvailabilityWithChannelsFragment,
  ]
);

export const reshapeProductSearchVariant = <TKey extends ProductTypeKey>(
  productTypeKey: TKey,
  data: FragmentOf<typeof productSearchVariantFragment>,
  locale: Locale
): ProductSearchVariant<TKey> => {
  const result = readFragment(productSearchVariantFragment, data);
  const attributes = reshapeProductAttributes(
    productTypeKey,
    result.attributesRaw,
    locale
  );

  return {
    ...result,
    attributes,
    price: result.price && reshapePriceFromSearch(result.price),
    availability:
      result.availability &&
      reshapeProductSearchVariantAvailability(result.availability),
  } as ProductSearchVariant<TKey>;
};
