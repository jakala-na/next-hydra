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
  readonly price?: number;
  readonly salePrice?: number;
  readonly imageUrl?: string;
  readonly isInStock: boolean;
  readonly availableQuantity?: number;
  readonly currencyCode?: string;
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
): ProductCardPresentation => ({
  id: product.id,
  slug: product.slug,
  imageUrl: product.featuredImage?.url ?? "",
  ...(product.featuredImage?.altText === undefined
    ? {}
    : { imageTitle: product.featuredImage.altText }),
  title: product.title,
  ...(product.description === undefined
    ? {}
    : { description: product.description }),
  ...(product.startingPrice === undefined
    ? {}
    : {
        price: toUnits(product.startingPrice.centAmount),
        currencyCode: product.startingPrice.currencyCode,
      }),
  isInStock: product.availableForSale,
});

const variantLabel = (
  product: ProductDetail,
  variant: ProductDetail["variants"][number]
): string => {
  const labels = product.options.flatMap((option) => {
    const selectedKey = variant.optionValues[option.key];
    const selectedValue = option.values.find(
      (value) => value.key === selectedKey
    );
    return selectedValue === undefined ? [] : [selectedValue.label];
  });

  return labels.length === 0 ? (variant.sku ?? variant.id) : labels.join(" / ");
};

export const toProductDetailPresentation = (
  product: ProductDetail
): ProductDetailPresentation => {
  const defaultImage = defaultVariant(product)?.images[0]?.url;
  const categoryName = product.categories[0]?.name;

  return {
    productId: product.id,
    title: product.title,
    ...(product.description === undefined
      ? {}
      : { description: product.description }),
    ...(categoryName === undefined ? {} : { categoryName }),
    availableForSale: isAvailableForSale(product),
    ...(defaultImage === undefined ? {} : { defaultImage }),
    defaultVariantId: product.defaultVariantId,
    variantLabel: product.options.map((option) => option.label).join(" / "),
    variants: product.variants.map((variant) => {
      const imageUrl = variant.images[0]?.url;
      const availableQuantity = variant.availability.availableQuantity;
      return {
        id: variant.id,
        value: variant.id,
        label: variantLabel(product, variant),
        ...(variant.price === undefined
          ? {}
          : {
              price: toUnits(variant.price.regular.centAmount),
              ...(variant.price.discounted === undefined
                ? {}
                : {
                    salePrice: toUnits(variant.price.discounted.centAmount),
                  }),
              currencyCode: variant.price.regular.currencyCode,
            }),
        ...(imageUrl === undefined ? {} : { imageUrl }),
        isInStock: variant.availability.availableForSale,
        ...(availableQuantity === undefined ? {} : { availableQuantity }),
      };
    }),
  };
};

export const toProductDetailMetadata = (product: ProductDetail): Metadata => ({
  title: product.title,
  description: product.description,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
});

export const toProductJsonLd = (product: ProductDetail) => {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: defaultVariant(product)?.images[0]?.url,
    offers: {
      "@type": "AggregateOffer",
      availability: isAvailableForSale(product)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };
};
