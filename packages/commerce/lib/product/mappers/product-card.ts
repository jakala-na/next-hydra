import type { CurrencyCode, Locale } from "@repo/i18n/types";
import { type FragmentOf, graphql, readFragment } from "../../../graphql";
import type { ProductCardDTO } from "../../types";
import type { ProductTypeKey } from "./attributes";
import {
  productSearchVariantFragment,
  reshapeProductSearchVariant,
} from "./variant";

export const productCardFragment = graphql(
  `
  fragment ProductCard on ProductProjection {
    id
    key
    productType {
      key
    }
    name(locale: $locale)
    description(locale: $locale)
    slug(locale: $locale)
    masterVariant {
      images {
        url
        label
      }
    }
    allVariants {
      ...ProductSearchVariant
    }
  }
`,
  [productSearchVariantFragment]
);

export const reshapeProductCard = (
  _product: FragmentOf<typeof productCardFragment>,
  locale: Locale
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reduce complexity to 15
): ProductCardDTO => {
  const product = readFragment(productCardFragment, _product);

  const productTypeKey = product.productType?.key;

  const masterVariant = product.masterVariant;

  // Collect max price and min price across variants.
  let minPriceCent: number | undefined;
  let maxPriceCent: number | undefined; // kept for potential future use
  let currencyCode: CurrencyCode | undefined;

  const variants = product.allVariants.map((v) =>
    reshapeProductSearchVariant(productTypeKey as ProductTypeKey, v, locale)
  );

  // TODO: Extract into helper for price range calculation
  for (const variant of variants) {
    const centAmount = variant.price?.value.centAmount;

    if (typeof centAmount === "number") {
      if (minPriceCent === undefined || centAmount < minPriceCent) {
        minPriceCent = centAmount;
      }
      if (maxPriceCent === undefined || centAmount > maxPriceCent) {
        maxPriceCent = centAmount;
      }
      if (!currencyCode && variant.price?.value.currencyCode) {
        currencyCode = variant.price?.value.currencyCode;
      }
    }
  }

  // Determine if product is available for sale based on variants
  const availableForSale = variants.some(
    (variant) => variant?.availability?.availableForSale
  );

  return {
    id: product.id,
    title: product.name || "",
    description: product.description ?? undefined,
    featuredImage: masterVariant.images?.[0]?.url
      ? {
          url: masterVariant.images[0].url,
          altText: masterVariant.images[0].label ?? "",
        }
      : undefined,
    priceFrom: minPriceCent ? minPriceCent / 100 : undefined,
    currency: currencyCode,
    slug: product.slug ?? undefined,
    availableForSale,
  };
};
