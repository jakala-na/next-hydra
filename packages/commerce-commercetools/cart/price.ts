import type { CurrencyCode } from "@repo/i18n/types";

import { graphql, readFragment } from "../graphql";
import type { FragmentOf } from "../graphql";

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
    discounted:
      price.discounted === null
        ? null
        : {
            ...price.discounted,
            value: {
              ...price.discounted.value,
              currencyCode: price.discounted.value.currencyCode as CurrencyCode,
            },
          },
    value: {
      ...price.value,
      currencyCode: price.value.currencyCode as CurrencyCode,
    },
  };
};

export const reshapePrice = (data: FragmentOf<typeof productPriceFragment>) => {
  const price = readFragment(productPriceFragment, data);
  return {
    ...price,
    discounted:
      price.discounted === null
        ? null
        : {
            ...price.discounted,
            value: {
              ...price.discounted.value,
              currencyCode: price.discounted.value.currencyCode as CurrencyCode,
            },
          },
    value: {
      ...price.value,
      currencyCode: price.value.currencyCode as CurrencyCode,
    },
  };
};
