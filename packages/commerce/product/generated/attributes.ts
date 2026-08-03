// This file is generated. Do not edit it manually.

import { Schema } from "effect";
import { ProductAttributeEnumValue } from "../attributes";
import { ProductId } from "../identity";
import {
  hasCompleteProductOptionSelection,
  hasDefaultProductVariant,
  hasUniqueProductVariantIds,
  makeProductDetailSchema,
  makeProductVariantSchema,
} from "../model";

const GenericProductTypeKey = Schema.Literal("generic-product").pipe(
  Schema.brand("ProductTypeKey")
);
type GenericProductTypeKey = typeof GenericProductTypeKey.Type;

const HeavyEarthmovingAndConstructionEquipmentProductTypeKey = Schema.Literal(
  "heavy-earthmoving-and-construction-equipment"
).pipe(Schema.brand("ProductTypeKey"));
type HeavyEarthmovingAndConstructionEquipmentProductTypeKey =
  typeof HeavyEarthmovingAndConstructionEquipmentProductTypeKey.Type;

const HeavyLiftingAndSpecializedEquipmentProductTypeKey = Schema.Literal(
  "heavy-lifting-and-specialized-equipment"
).pipe(Schema.brand("ProductTypeKey"));
type HeavyLiftingAndSpecializedEquipmentProductTypeKey =
  typeof HeavyLiftingAndSpecializedEquipmentProductTypeKey.Type;

export const ProductTypeKey = Schema.Union([
  GenericProductTypeKey,
  HeavyEarthmovingAndConstructionEquipmentProductTypeKey,
  HeavyLiftingAndSpecializedEquipmentProductTypeKey,
]);
export type ProductTypeKey = typeof ProductTypeKey.Type;

export const GenericProductAttributes = Schema.Record(
  Schema.String,
  Schema.Never
);
export type GenericProductAttributes = typeof GenericProductAttributes.Type;

export const HeavyEarthmovingAndConstructionEquipmentAttributes = Schema.Struct(
  {
    capacity: Schema.optional(Schema.Number),
    iso45001: Schema.optional(Schema.Boolean),
    relatedProducts: Schema.optional(Schema.Array(ProductId)),
    mobility: Schema.optional(ProductAttributeEnumValue),
    model: Schema.Number,
  }
);
export type HeavyEarthmovingAndConstructionEquipmentAttributes =
  typeof HeavyEarthmovingAndConstructionEquipmentAttributes.Type;

export const HeavyLiftingAndSpecializedEquipmentAttributes = Schema.Struct({
  capacity: Schema.optional(Schema.Number),
  iso45001: Schema.optional(Schema.Boolean),
  relatedProducts: Schema.optional(Schema.Array(ProductId)),
  mobility: Schema.optional(ProductAttributeEnumValue),
  color: ProductAttributeEnumValue,
});
export type HeavyLiftingAndSpecializedEquipmentAttributes =
  typeof HeavyLiftingAndSpecializedEquipmentAttributes.Type;

export const ProductAttributesSchemaByProductType = {
  "generic-product": GenericProductAttributes,
  "heavy-earthmoving-and-construction-equipment":
    HeavyEarthmovingAndConstructionEquipmentAttributes,
  "heavy-lifting-and-specialized-equipment":
    HeavyLiftingAndSpecializedEquipmentAttributes,
} as const;

export type ProductAttributesByProductType = {
  readonly "generic-product": GenericProductAttributes;
  readonly "heavy-earthmoving-and-construction-equipment":
    HeavyEarthmovingAndConstructionEquipmentAttributes;
  readonly "heavy-lifting-and-specialized-equipment":
    HeavyLiftingAndSpecializedEquipmentAttributes;
};

export type ProductAttributes<
  TKey extends ProductTypeKey = ProductTypeKey,
> = TKey extends GenericProductTypeKey
  ? GenericProductAttributes
  : TKey extends HeavyEarthmovingAndConstructionEquipmentProductTypeKey
    ? HeavyEarthmovingAndConstructionEquipmentAttributes
    : TKey extends HeavyLiftingAndSpecializedEquipmentProductTypeKey
      ? HeavyLiftingAndSpecializedEquipmentAttributes
      : never;

const GenericProductVariant = makeProductVariantSchema(
  GenericProductAttributes
);
const HeavyEarthmovingAndConstructionEquipmentVariant =
  makeProductVariantSchema(
    HeavyEarthmovingAndConstructionEquipmentAttributes
  );
const HeavyLiftingAndSpecializedEquipmentVariant = makeProductVariantSchema(
  HeavyLiftingAndSpecializedEquipmentAttributes
);

export const ProductVariant = Schema.Union([
  GenericProductVariant,
  HeavyEarthmovingAndConstructionEquipmentVariant,
  HeavyLiftingAndSpecializedEquipmentVariant,
]);

const ProductDetailSchema = Schema.Union([
  makeProductDetailSchema(GenericProductTypeKey, GenericProductVariant),
  makeProductDetailSchema(
    HeavyEarthmovingAndConstructionEquipmentProductTypeKey,
    HeavyEarthmovingAndConstructionEquipmentVariant
  ),
  makeProductDetailSchema(
    HeavyLiftingAndSpecializedEquipmentProductTypeKey,
    HeavyLiftingAndSpecializedEquipmentVariant
  ),
]);

export const ProductDetail = ProductDetailSchema.check(
  Schema.makeFilter(hasDefaultProductVariant, {
    expected: "defaultVariantId to identify a Product Variant",
  }),
  Schema.makeFilter(hasUniqueProductVariantIds, {
    expected: "unique Product Variant IDs",
  }),
  Schema.makeFilter(hasCompleteProductOptionSelection, {
    expected:
      "every Product Variant to select one defined value for every Product Option",
  })
);

type ProductDetailForKey<Detail, TKey extends ProductTypeKey> = Detail extends {
  readonly productType: TKey;
}
  ? Detail
  : never;

export type ProductDetail<TKey extends ProductTypeKey = ProductTypeKey> =
  ProductDetailForKey<typeof ProductDetail.Type, TKey>;

export type ProductVariant<TKey extends ProductTypeKey = ProductTypeKey> =
  ProductDetail<TKey>["variants"][number];
