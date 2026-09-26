import {
  ProductCard,
  ProductDetail,
  ProductTypeKey,
} from "@repo/commerce/product";
import type { CommerceLocale } from "@repo/commerce/store";
import { Effect, Option, Schema } from "effect";

import { productAttributesReader } from "../product-attributes";
import type {
  CommercetoolsProductPrice,
  CommercetoolsProductProjection,
  CommercetoolsProductVariant,
} from "./client";

type ProductTypeKeyValue = ProductTypeKey;
type ProductTypeName = keyof typeof OPTION_BY_PRODUCT_TYPE;

const OPTION_BY_PRODUCT_TYPE = {
  "generic-product": undefined,
  "heavy-earthmoving-and-construction-equipment": {
    key: "model",
    label: "Model",
  },
  "heavy-lifting-and-specialized-equipment": {
    key: "color",
    label: "Color",
  },
} as const satisfies Record<
  ProductTypeKeyValue,
  { readonly key: string; readonly label: string } | undefined
>;

const productTypeName = (value: ProductTypeKeyValue): ProductTypeName => value;

const unsupportedProductType = (productType: never) =>
  Effect.die(new Error(`Unsupported Product Type: ${String(productType)}`));

const readVariantAttributes = (
  productTypeKey: ProductTypeKeyValue,
  variant: CommercetoolsProductVariant,
  locale: CommerceLocale
) => {
  const productType = productTypeName(productTypeKey);
  switch (productType) {
    case "generic-product": {
      const reader = productAttributesReader.fromGraphql(
        "generic-product",
        variant.attributesRaw,
        { locale }
      );
      return reader.read.pipe(
        Effect.map((attributes) => ({ attributes, selectedOption: undefined }))
      );
    }
    case "heavy-earthmoving-and-construction-equipment": {
      const option =
        OPTION_BY_PRODUCT_TYPE["heavy-earthmoving-and-construction-equipment"];
      const reader = productAttributesReader.fromGraphql(
        "heavy-earthmoving-and-construction-equipment",
        variant.attributesRaw,
        { locale }
      );
      return Effect.all({
        attributes: reader.read,
        selectedAttribute: reader.get(option.key),
      }).pipe(
        Effect.map(({ attributes, selectedAttribute }) => ({
          attributes,
          selectedOption: selectedAttribute.pipe(
            Option.map((value) => {
              const text = String(value);
              return { key: text, label: text };
            }),
            Option.getOrUndefined
          ),
        }))
      );
    }
    case "heavy-lifting-and-specialized-equipment": {
      const option =
        OPTION_BY_PRODUCT_TYPE["heavy-lifting-and-specialized-equipment"];
      const reader = productAttributesReader.fromGraphql(
        "heavy-lifting-and-specialized-equipment",
        variant.attributesRaw,
        { locale }
      );
      return Effect.all({
        attributes: reader.read,
        selectedAttribute: reader.get(option.key),
      }).pipe(
        Effect.map(({ attributes, selectedAttribute }) => ({
          attributes,
          selectedOption: selectedAttribute.pipe(
            Option.map(({ key, label }) => ({ key, label })),
            Option.getOrUndefined
          ),
        }))
      );
    }
    default: {
      return unsupportedProductType(productType);
    }
  }
};

const mapPrice = (price: CommercetoolsProductPrice | null) => {
  if (price === null) {
    return undefined;
  }
  if (price.discounted === null) {
    return { regular: price.value };
  }
  return { discounted: price.discounted.value, regular: price.value };
};

const mapAvailability = (variant: CommercetoolsProductVariant) => {
  const availableQuantity = Math.max(
    0,
    variant.availability?.channels.reduce(
      (total, channel) => total + (channel.availableQuantity ?? 0),
      0
    ) ?? 0
  );
  return {
    availableForSale: availableQuantity > 0,
    availableQuantity,
  };
};

const mapImages = (variant: CommercetoolsProductVariant) =>
  variant.images.map(({ label, url }) =>
    label === null ? { url } : { altText: label, url }
  );

const mapVariant = (
  productType: ProductTypeKeyValue,
  variant: CommercetoolsProductVariant,
  locale: CommerceLocale
) =>
  Effect.gen(function* () {
    const { attributes, selectedOption } = yield* readVariantAttributes(
      productType,
      variant,
      locale
    );
    const option = OPTION_BY_PRODUCT_TYPE[productTypeName(productType)];

    const mapped = {
      attributes,
      availability: mapAvailability(variant),
      id: String(variant.id),
      images: mapImages(variant),
      optionValues:
        option === undefined || selectedOption === undefined
          ? {}
          : { [option.key]: selectedOption.key },
      selectedOption,
    };

    const mappedWithSku =
      variant.sku === null ? mapped : { ...mapped, sku: variant.sku };
    return variant.price === null
      ? mappedWithSku
      : { ...mappedWithSku, price: mapPrice(variant.price) };
  });

const mapCategory = (
  category: CommercetoolsProductProjection["categories"][number]
) => {
  const { id, name, slug } = category;
  if (name === null && slug === null) {
    return { id };
  }
  if (name === null) {
    return { id, slug };
  }
  if (slug === null) {
    return { id, name };
  }
  return { id, name, slug };
};

export const mapProductDetail = (
  product: CommercetoolsProductProjection,
  eligibleVariants: readonly CommercetoolsProductVariant[],
  locale: CommerceLocale
) =>
  Effect.gen(function* () {
    const productType = yield* Schema.decodeUnknownEffect(ProductTypeKey)(
      product.productType?.key
    );
    const variantsWithOptions = yield* Effect.forEach(
      (item: CommercetoolsProductVariant) =>
        mapVariant(productType, item, locale)
    )(eligibleVariants);
    const option = OPTION_BY_PRODUCT_TYPE[productTypeName(productType)];
    const values =
      option === undefined
        ? []
        : [
            ...new Map(
              variantsWithOptions.flatMap(({ selectedOption }) =>
                selectedOption === undefined
                  ? []
                  : [[selectedOption.key, selectedOption] as const]
              )
            ).values(),
          ];
    const variants = variantsWithOptions.map(
      ({ selectedOption: _selectedOption, ...item }) => item
    );

    const detail = {
      categories: product.categories.map(mapCategory),
      defaultVariantId: variants[0]?.id,
      id: product.id,
      options:
        option === undefined
          ? []
          : [{ key: option.key, label: option.label, values }],
      productType,
      slug: product.slug,
      title: product.name,
      variants,
    };
    const detailWithDescription =
      product.description === null
        ? detail
        : { ...detail, description: product.description };

    return yield* Schema.decodeUnknownEffect(ProductDetail)(
      detailWithDescription
    );
  });

export const mapProductCard = (
  product: CommercetoolsProductProjection,
  eligibleVariants: readonly CommercetoolsProductVariant[]
) => {
  const prices = eligibleVariants.flatMap(({ price }) =>
    price === null ? [] : [price.value]
  );
  let startingPrice: (typeof prices)[number] | undefined;
  for (const price of prices) {
    if (
      startingPrice === undefined ||
      price.centAmount < startingPrice.centAmount
    ) {
      startingPrice = price;
    }
  }
  const [featuredImage] = product.masterVariant.images;
  const card = {
    availableForSale: eligibleVariants.some(
      (item) => mapAvailability(item).availableForSale
    ),
    id: product.id,
    slug: product.slug,
    title: product.name,
  };
  const cardWithDescription =
    product.description === null
      ? card
      : { ...card, description: product.description };
  let mappedFeaturedImage:
    | { readonly altText?: string; readonly url: string }
    | undefined;
  if (featuredImage !== undefined) {
    mappedFeaturedImage =
      featuredImage.label === null
        ? { url: featuredImage.url }
        : { altText: featuredImage.label, url: featuredImage.url };
  }
  const cardWithFeaturedImage =
    mappedFeaturedImage === undefined
      ? cardWithDescription
      : { ...cardWithDescription, featuredImage: mappedFeaturedImage };
  const completedCard =
    startingPrice === undefined
      ? cardWithFeaturedImage
      : { ...cardWithFeaturedImage, startingPrice };

  return Schema.decodeUnknownEffect(ProductCard)(completedCard);
};
