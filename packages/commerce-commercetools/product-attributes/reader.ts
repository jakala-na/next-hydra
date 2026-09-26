import { ProductAttributesSchemaByProductType } from "@repo/commerce/product";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option, Schema } from "effect";

import { localizedTextForLocale } from "./localization";

export type ProductTypeKey = keyof typeof ProductAttributesSchemaByProductType;

type ProductAttributesFor<ProductType extends ProductTypeKey> =
  (typeof ProductAttributesSchemaByProductType)[ProductType]["Type"];

type ProductAttributeName<ProductType extends ProductTypeKey> = Extract<
  keyof ProductAttributesFor<ProductType>,
  string
>;

type ProductAttributeValue<
  ProductType extends ProductTypeKey,
  AttributeName extends ProductAttributeName<ProductType>,
> = ProductAttributesFor<ProductType>[AttributeName];

type SelectedAttribute<Name extends PropertyKey, Value> = Readonly<
  Partial<Record<Name, Value>>
>;

export type ProductAttributeRaw = {
  readonly name: string;
  readonly value: unknown;
};

export interface ProductAttributesProjection<
  ProductType extends ProductTypeKey,
  Output extends object,
> {
  readonly pick: <AttributeName extends ProductAttributeName<ProductType>>(
    attributeName: AttributeName
  ) => PendingProductAttributesProjection<
    ProductType,
    Output,
    AttributeName,
    ProductAttributeValue<ProductType, AttributeName>
  >;
  // oxlint-disable-next-line effecttsgo/lazy-effect -- Finalization as a method preserves the fluent projection interface while the returned Effect remains lazy.
  readonly toValues: () => Effect.Effect<Output, Schema.SchemaError>;
}

export interface PendingProductAttributesProjection<
  ProductType extends ProductTypeKey,
  Output extends object,
  AttributeName extends ProductAttributeName<ProductType>,
  Value,
> extends ProductAttributesProjection<
  ProductType,
  Output & SelectedAttribute<AttributeName, Value>
> {
  readonly as: <Alias extends string>(
    alias: Alias
  ) => ProductAttributesProjection<
    ProductType,
    Output & SelectedAttribute<Alias, Value>
  >;
}

export interface ProductAttributesReader<
  ProductType extends ProductTypeKey,
> extends ProductAttributesProjection<
  ProductType,
  Readonly<Record<never, never>>
> {
  readonly get: <AttributeName extends ProductAttributeName<ProductType>>(
    attributeName: AttributeName
  ) => Effect.Effect<
    Option.Option<ProductAttributeValue<ProductType, AttributeName>>,
    Schema.SchemaError
  >;
  readonly read: Effect.Effect<
    ProductAttributesFor<ProductType>,
    Schema.SchemaError
  >;
}

const RawProductAttribute = Schema.Struct({
  name: Schema.String,
  value: Schema.Json,
});

const RawProductAttributes = Schema.Array(RawProductAttribute).check(
  Schema.makeFilter(
    (attributes) =>
      new Set(attributes.map((attribute) => attribute.name)).size ===
      attributes.length,
    { expected: "unique Product Attribute names" }
  )
);

const ProductReference = Schema.Struct({
  id: Schema.String,
  typeId: Schema.Literal("product"),
});

const LocalizedValue = Schema.Record(Schema.String, Schema.String);
const PlainEnumValue = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
});
const LocalizedEnumValue = Schema.Struct({
  key: Schema.String,
  label: LocalizedValue,
});

const JsonArray = Schema.Array(Schema.Json);
const decodeProductReference = Schema.decodeUnknownOption(ProductReference);
const decodePlainEnumValue = Schema.decodeUnknownOption(PlainEnumValue);
const decodeLocalizedEnumValue = Schema.decodeUnknownOption(LocalizedEnumValue);
const decodeLocalizedValue = Schema.decodeUnknownOption(LocalizedValue);
const decodeJsonArray = Schema.decodeUnknownOption(JsonArray);

const normalizeValue = (value: Schema.Json, locale: Locale): Schema.Json => {
  const array = decodeJsonArray(value);
  if (Option.isSome(array)) {
    return array.value.map((item) => normalizeValue(item, locale));
  }

  const productReference = decodeProductReference(value);
  if (Option.isSome(productReference)) {
    return productReference.value.id;
  }

  const plainEnumValue = decodePlainEnumValue(value);
  if (Option.isSome(plainEnumValue)) {
    return plainEnumValue.value;
  }

  const localizedEnumValue = decodeLocalizedEnumValue(value);
  if (Option.isSome(localizedEnumValue)) {
    return {
      key: localizedEnumValue.value.key,
      label: Option.getOrNull(
        localizedTextForLocale(localizedEnumValue.value.label, locale)
      ),
    };
  }

  const localizedValue = decodeLocalizedValue(value);
  if (Option.isSome(localizedValue)) {
    return Option.getOrNull(
      localizedTextForLocale(localizedValue.value, locale)
    );
  }

  return value;
};

const decodeAttributes = <ProductType extends ProductTypeKey>(
  productType: ProductType,
  attributesRaw: readonly ProductAttributeRaw[],
  locale: Locale
) =>
  Schema.decodeUnknownEffect(RawProductAttributes)(attributesRaw).pipe(
    Effect.map((attributes) =>
      Object.fromEntries(
        attributes.map(({ name, value }) => [
          name,
          normalizeValue(value, locale),
        ])
      )
    ),
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        ProductAttributesSchemaByProductType[productType]
      )
    )
  );

const makeReader = <ProductType extends ProductTypeKey>(
  productType: ProductType,
  attributesRaw: readonly ProductAttributeRaw[],
  locale: Locale
): ProductAttributesReader<ProductType> => {
  const read = decodeAttributes(productType, attributesRaw, locale);
  const get = <AttributeName extends ProductAttributeName<ProductType>>(
    attributeName: AttributeName
  ) =>
    read.pipe(
      Effect.map((attributes) =>
        attributeName in attributes
          ? Option.some(attributes[attributeName])
          : Option.none<ProductAttributeValue<ProductType, AttributeName>>()
      )
    );

  const addProjectedAttribute = <
    Output extends object,
    Alias extends string,
    Value,
  >(
    values: Effect.Effect<Output, Schema.SchemaError>,
    attribute: Effect.Effect<Option.Option<Value>, Schema.SchemaError>,
    alias: Alias
  ) =>
    Effect.all([values, attribute]).pipe(
      Effect.map(([current, selected]) => {
        const projected = Option.isNone(selected)
          ? current
          : { ...current, [alias]: selected.value };
        // SAFETY: the selected value is assigned only to the Alias captured by
        // the typed pick/as call, and absence leaves the optional field omitted.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return projected as Output & SelectedAttribute<Alias, Value>;
      })
    );

  const makeProjection = <Output extends object>(
    values: Effect.Effect<Output, Schema.SchemaError>
  ): ProductAttributesProjection<ProductType, Output> => {
    const pick = <AttributeName extends ProductAttributeName<ProductType>>(
      attributeName: AttributeName
    ): PendingProductAttributesProjection<
      ProductType,
      Output,
      AttributeName,
      ProductAttributeValue<ProductType, AttributeName>
    > => {
      const projectAs = <Alias extends string>(alias: Alias) =>
        makeProjection(
          addProjectedAttribute(values, get(attributeName), alias)
        );
      return { ...projectAs(attributeName), as: projectAs };
    };

    return { pick, toValues: () => values };
  };

  const projection = makeProjection(
    Effect.succeed<Readonly<Record<never, never>>>({})
  );
  return { get, pick: projection.pick, read, toValues: projection.toValues };
};

export const productAttributesReader = {
  fromGraphql: <ProductType extends ProductTypeKey>(
    productType: ProductType,
    attributesRaw: readonly ProductAttributeRaw[],
    options: { readonly locale: Locale }
  ): ProductAttributesReader<ProductType> =>
    makeReader(productType, attributesRaw, options.locale),
};
