import {
  productSearchVariantFragment,
  reshapeProductSearchVariant,
} from "@repo/commerce/lib/product/mappers/variant";
import type { Locale } from "@repo/i18n/types";
import { type FragmentOf, graphql, readFragment } from "../../../graphql";
import type { ProductSelectionRule } from "../../store/types";
import type {
  ProductDetailsDTO,
  ProductOption,
  ProductVariant,
} from "../../types";
import { filterVariantsByProductSelections } from "../utils/product-selections";
import type { ProductTypeKey } from "./attributes";

export const productPageFragment = graphql(
  `
  fragment ProductPage on ProductProjection {
    id
    key
    version
    lastModifiedAt
    name(locale: $locale)
    description(locale: $locale)
    slug(locale: $locale)
    categories {
      id
      key
      name(locale: $locale)
      slug(locale: $locale)
    }
    productType {
      key
    }
    masterVariant {
      sku
      images {
        url
        label
      }
      ...ProductSearchVariant
    }
    allVariants {
      sku
      images {
        url
        label
      }
      ...ProductSearchVariant
    }
  }
`,
  [productSearchVariantFragment]
);

export const reshapeProductPage = (
  data: FragmentOf<typeof productPageFragment>,
  locale: Locale,
  productSelections: Map<string, ProductSelectionRule[]>
): ProductDetailsDTO<ProductTypeKey> | null => {
  const productResult = readFragment(productPageFragment, data);

  const productTypeKey = productResult.productType?.key;
  if (!productTypeKey) {
    return null;
  }

  // Use filtered variants if provided, otherwise use all variants
  const inStoreVariants = filterVariantsByProductSelections(
    productResult.allVariants,
    productSelections.get(productResult.id) ?? []
  );
  if (inStoreVariants.length === 0) {
    return null;
  }
  // Transform allVariants to ProductVariant format

  const variants = inStoreVariants?.map((productVariant) => {
    const reshapedVariant = reshapeProductSearchVariant(
      productTypeKey as ProductTypeKey,
      productVariant,
      locale
    );

    return {
      id: reshapedVariant.id,
      availableForSale: reshapedVariant.availability?.availableForSale ?? false,
      availableQuantity: reshapedVariant.availability?.availableQuantity ?? 0,
      price: reshapedVariant.price,
      attributes: reshapedVariant.attributes,
      images: productVariant.images
        ? productVariant.images.map((img) => ({
            url: img.url,
            altText: img.label ?? "",
          }))
        : undefined,
    } satisfies ProductVariant<ProductTypeKey>;
  });

  // Determine if product is available for sale based on variants
  const availableForSale = variants.some((variant) => variant.availableForSale);

  const createOptions = (
    list: ProductVariant<ProductTypeKey>[]
  ): ProductOption[] => [
    {
      key: "model",
      label: "Model",
      type: "enum" as const,
      values: list
        .map((v) => (v.attributes as { model?: number }).model)
        .filter((model): model is number => model !== undefined)
        .map((model) => ({
          label: String(model),
          value: String(model),
        })),
    },
  ];

  // Type guard for variants[0]
  if (!variants[0]) {
    return null;
  }

  return {
    id: productResult.id,
    title: productResult?.name || "",
    description: productResult?.description ?? "",
    slug: productResult?.slug ?? undefined,
    availableForSale,
    options: createOptions(variants),
    variants,
    masterVariant: variants[0],
    attributes: reshapeProductSearchVariant(
      productTypeKey as ProductTypeKey,
      productResult?.masterVariant,
      locale
    ).attributes,
    categories: productResult?.categories ?? [],
    seo: {
      title: productResult?.name || "",
      description: productResult?.description ?? "",
      searchable: true,
    },
    updatedAt: productResult?.lastModifiedAt ?? undefined,
  };
};
