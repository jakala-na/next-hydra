import { type FragmentOf, graphql, readFragment } from "@repo/commerce/graphql";
import type { CurrencyCode } from "@repo/i18n/types";

export const productPriceSearchFragment = graphql(`
  fragment ProductPriceSearch on ProductPriceSearch {
    value {
      centAmount
      currencyCode
    }
    discounted {
      value {
        centAmount
        currencyCode
      }
    }
  }
`);

export const productPriceFragment = graphql(`
  fragment ProductPrice on ProductPrice {
    value {
      centAmount
      currencyCode
    }
    discounted {
      value {
        centAmount
        currencyCode
      }
    }
  }
`);

export const reshapePriceFromSearch = (
  data: FragmentOf<typeof productPriceSearchFragment>
) => {
  const price = readFragment(productPriceSearchFragment, data);
  return {
    ...price,
    value: {
      ...price.value,
      currencyCode: price.value.currencyCode as CurrencyCode,
    },
    discounted:
      price.discounted !== null
        ? {
            ...price.discounted,
            value: {
              ...price.discounted.value,
              currencyCode: price.discounted.value.currencyCode as CurrencyCode,
            },
          }
        : null,
  };
};

export const reshapePrice = (data: FragmentOf<typeof productPriceFragment>) => {
  const price = readFragment(productPriceFragment, data);
  return {
    ...price,
    value: {
      ...price.value,
      currencyCode: price.value.currencyCode as CurrencyCode,
    },
    discounted:
      price.discounted !== null
        ? {
            ...price.discounted,
            value: {
              ...price.discounted.value,
              currencyCode: price.discounted.value.currencyCode as CurrencyCode,
            },
          }
        : null,
  };
};
