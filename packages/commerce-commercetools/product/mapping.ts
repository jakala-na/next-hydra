import {
  ProductAttributesSchemaByProductType,
  ProductCard,
  ProductDetail,
  ProductTypeKey,
} from "@repo/commerce/product";
import type { CommerceLocale } from "@repo/commerce/store";
import { Effect, Schema } from "effect";
import type {
  CommercetoolsProductPrice,
  CommercetoolsProductProjection,
  CommercetoolsProductVariant,
} from "./client";

type ProductTypeKeyValue = typeof ProductTypeKey.Type;
type ProductTypeName = keyof typeof ProductAttributesSchemaByProductType;

const productTypeName = (value: ProductTypeKeyValue): ProductTypeName =>
  value as ProductTypeName;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const localize = (value: unknown, locale: CommerceLocale): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => localize(item, locale));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (value.typeId === "product" && typeof value.id === "string") {
    return value.id;
  }
  if (typeof value.key === "string" && "label" in value) {
    const label = value.label;
    if (typeof label === "string") {
      return { key: value.key, label };
    }
    if (isRecord(label) && typeof label[locale] === "string") {
      return { key: value.key, label: label[locale] };
    }
  }
  if (typeof value[locale] === "string") {
    return value[locale];
  }
  return value;
};

const decodeAttributes = (
  productType: ProductTypeKeyValue,
  variant: CommercetoolsProductVariant,
  locale: CommerceLocale
) => {
  const attributes = Object.fromEntries(
    variant.attributesRaw.map(({ name, value }) => [
      name,
      localize(value, locale),
    ])
  );
  return Schema.decodeUnknownEffect(
    ProductAttributesSchemaByProductType[productTypeName(productType)]
  )(attributes);
};

const mapPrice = (price: CommercetoolsProductPrice | null) =>
  price === null
    ? undefined
    : {
        regular: price.value,
        ...(price.discounted === null
          ? {}
          : { discounted: price.discounted.value }),
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
  variant.images.map(({ label, url }) => ({
    url,
    ...(label === null ? {} : { altText: label }),
  }));

const optionValue = (value: unknown) => {
  if (isRecord(value) && typeof value.key === "string") {
    return {
      key: value.key,
      label: typeof value.label === "string" ? value.label : value.key,
    };
  }
  const text = String(value);
  return { key: text, label: text };
};

const mapVariant = (
  productType: ProductTypeKeyValue,
  variant: CommercetoolsProductVariant,
  locale: CommerceLocale
) =>
  Effect.gen(function* () {
    const attributes = yield* decodeAttributes(productType, variant, locale);
    const option = OPTION_BY_PRODUCT_TYPE[productTypeName(productType)];
    const selectedOption =
      option === undefined
        ? undefined
        : optionValue((attributes as Record<string, unknown>)[option.key]);

    return {
      id: String(variant.id),
      ...(variant.sku === null ? {} : { sku: variant.sku }),
      images: mapImages(variant),
      attributes,
      optionValues:
        option === undefined || selectedOption === undefined
          ? {}
          : { [option.key]: selectedOption.key },
      ...(variant.price === null ? {} : { price: mapPrice(variant.price) }),
      availability: mapAvailability(variant),
      selectedOption,
    };
  });

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
      eligibleVariants,
      (item) => mapVariant(productType, item, locale)
    );
    const option = OPTION_BY_PRODUCT_TYPE[productTypeName(productType)];
    const values =
      option === undefined
        ? []
        : Array.from(
            new Map(
              variantsWithOptions.flatMap(({ selectedOption }) =>
                selectedOption === undefined
                  ? []
                  : [[selectedOption.key, selectedOption] as const]
              )
            ).values()
          );
    const variants = variantsWithOptions.map(
      ({ selectedOption: _selectedOption, ...item }) => item
    );

    return yield* Schema.decodeUnknownEffect(ProductDetail)({
      id: product.id,
      slug: product.slug,
      productType,
      title: product.name,
      ...(product.description === null
        ? {}
        : { description: product.description }),
      categories: product.categories.map(({ id, name, slug }) => ({
        id,
        ...(name === null ? {} : { name }),
        ...(slug === null ? {} : { slug }),
      })),
      options:
        option === undefined
          ? []
          : [{ key: option.key, label: option.label, values }],
      variants,
      defaultVariantId: variants[0]?.id,
    });
  });

export const mapProductCard = (
  product: CommercetoolsProductProjection,
  eligibleVariants: readonly CommercetoolsProductVariant[]
) => {
  const prices = eligibleVariants.flatMap(({ price }) =>
    price === null ? [] : [price.value]
  );
  const startingPrice = prices.reduce<(typeof prices)[number] | undefined>(
    (lowest, price) =>
      lowest === undefined || price.centAmount < lowest.centAmount
        ? price
        : lowest,
    undefined
  );
  const featuredImage = product.masterVariant.images[0];

  return Schema.decodeUnknownEffect(ProductCard)({
    id: product.id,
    slug: product.slug,
    title: product.name,
    ...(product.description === null
      ? {}
      : { description: product.description }),
    ...(featuredImage === undefined
      ? {}
      : {
          featuredImage: {
            url: featuredImage.url,
            ...(featuredImage.label === null
              ? {}
              : { altText: featuredImage.label }),
          },
        }),
    ...(startingPrice === undefined ? {} : { startingPrice }),
    availableForSale: eligibleVariants.some(
      (item) => mapAvailability(item).availableForSale
    ),
  });
};
