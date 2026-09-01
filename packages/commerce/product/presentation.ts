import type { Metadata } from "next";

import type { ProductDetail } from "./generated/attributes";
import type { ProductCard } from "./model";

const CENTS_PER_UNIT = 100;

export interface ProductCardPresentation {
  readonly id: string;
  readonly slug: string;
  readonly imageUrl: string;
  readonly imageTitle?: string;
  readonly title: string;
  readonly description?: string;
  readonly price?: number;
  readonly currencyCode?: string;
  readonly isInStock: boolean;
}

export interface ProductDetailVariantPresentation {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly options: readonly ProductVariantOptionPresentation[];
  readonly price?: number;
  readonly salePrice?: number;
  readonly imageUrl?: string;
  readonly isInStock: boolean;
  readonly availableQuantity?: number;
  readonly currencyCode?: string;
}

export interface ProductVariantOptionPresentation {
  readonly name: string;
  readonly value: string;
}

export interface ProductDetailPresentation {
  readonly productId: string;
  readonly title: string;
  readonly description?: string;
  readonly categoryName?: string;
  readonly availableForSale: boolean;
  readonly defaultImage?: string;
  readonly defaultVariantId: string;
  readonly variantLabel: string;
  readonly variants: ProductDetailVariantPresentation[];
}

const toUnits = (centAmount: number): number => centAmount / CENTS_PER_UNIT;

const defaultVariant = (product: ProductDetail) =>
  product.variants.find((variant) => variant.id === product.defaultVariantId);

const isAvailableForSale = (product: ProductDetail): boolean =>
  product.variants.some((variant) => variant.availability.availableForSale);

export const toProductCardPresentation = (
  product: ProductCard
): ProductCardPresentation => {
  let presentation: ProductCardPresentation = {
    id: product.id,
    imageUrl: product.featuredImage?.url ?? "",
    isInStock: product.availableForSale,
    slug: product.slug,
    title: product.title,
  };
  if (product.featuredImage?.altText !== undefined) {
    presentation = {
      ...presentation,
      imageTitle: product.featuredImage.altText,
    };
  }
  if (product.description !== undefined) {
    presentation = { ...presentation, description: product.description };
  }
  if (product.startingPrice !== undefined) {
    presentation = {
      ...presentation,
      currencyCode: product.startingPrice.currencyCode,
      price: toUnits(product.startingPrice.centAmount),
    };
  }
  return presentation;
};

const variantOptions = (
  product: ProductDetail,
  variant: ProductDetail["variants"][number]
): readonly ProductVariantOptionPresentation[] =>
  product.options.flatMap((option) => {
    const selectedKey = variant.optionValues[option.key];
    const selectedValue = option.values.find(
      (value) => value.key === selectedKey
    );
    return selectedValue === undefined
      ? []
      : [{ name: option.label, value: selectedValue.label }];
  });

const toProductDetailVariantPresentation = (
  product: ProductDetail,
  variant: ProductDetail["variants"][number]
): ProductDetailVariantPresentation => {
  const options = variantOptions(product, variant);
  let presentation: ProductDetailVariantPresentation = {
    id: variant.id,
    isInStock: variant.availability.availableForSale,
    label:
      options.length === 0
        ? (variant.sku ?? variant.id)
        : options.map(({ value }) => value).join(" / "),
    options,
    value: variant.id,
  };
  if (variant.price !== undefined) {
    presentation = {
      ...presentation,
      currencyCode: variant.price.regular.currencyCode,
      price: toUnits(variant.price.regular.centAmount),
    };
    if (variant.price.discounted !== undefined) {
      presentation = {
        ...presentation,
        salePrice: toUnits(variant.price.discounted.centAmount),
      };
    }
  }
  const imageUrl = variant.images[0]?.url;
  if (imageUrl !== undefined) {
    presentation = { ...presentation, imageUrl };
  }
  const { availableQuantity } = variant.availability;
  if (availableQuantity !== undefined) {
    presentation = { ...presentation, availableQuantity };
  }
  return presentation;
};

export const toProductDetailPresentation = (
  product: ProductDetail
): ProductDetailPresentation => {
  const defaultImage = defaultVariant(product)?.images[0]?.url;
  const categoryName = product.categories[0]?.name;
  let presentation: ProductDetailPresentation = {
    availableForSale: isAvailableForSale(product),
    defaultVariantId: product.defaultVariantId,
    productId: product.id,
    title: product.title,
    variantLabel: product.options.map((option) => option.label).join(" / "),
    variants: product.variants.map((variant) =>
      toProductDetailVariantPresentation(product, variant)
    ),
  };
  if (product.description !== undefined) {
    presentation = { ...presentation, description: product.description };
  }
  if (categoryName !== undefined) {
    presentation = { ...presentation, categoryName };
  }
  if (defaultImage !== undefined) {
    presentation = { ...presentation, defaultImage };
  }
  return presentation;
};

export const toProductDetailMetadata = (product: ProductDetail): Metadata => ({
  description: product.description,
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
    },
    index: true,
  },
  title: product.title,
});

export const toProductJsonLd = (product: ProductDetail) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  description: product.description,
  image: defaultVariant(product)?.images[0]?.url,
  name: product.title,
  offers: {
    "@type": "AggregateOffer",
    availability: isAvailableForSale(product)
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  },
});
