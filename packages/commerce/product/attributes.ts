import { Schema } from "effect";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const ProductAttributeEnumValueKey = Schema.NonEmptyString.pipe(
  Schema.brand("ProductAttributeEnumValueKey")
);
export type ProductAttributeEnumValueKey =
  typeof ProductAttributeEnumValueKey.Type;

export const ProductAttributeEnumValue = Schema.Struct({
  key: ProductAttributeEnumValueKey,
  label: Schema.NonEmptyString,
});
export type ProductAttributeEnumValue = typeof ProductAttributeEnumValue.Type;

export const makeProductAttributeEnumValueSchema = <
  const Keys extends readonly [string, ...string[]],
>(
  keys: Keys
) =>
  Schema.Struct({
    key: Schema.Literals(keys).pipe(
      Schema.brand("ProductAttributeEnumValueKey")
    ),
    label: Schema.NonEmptyString,
  });

export const ProductAttributeDate = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!ISO_DATE_PATTERN.test(value)) {
        return false;
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    },
    { expected: "an ISO 8601 calendar date" }
  )
).pipe(Schema.brand("ProductAttributeDate"));
export type ProductAttributeDate = typeof ProductAttributeDate.Type;

export const ProductAttributeDateTime = Schema.DateTimeUtcFromString;
export type ProductAttributeDateTime = typeof ProductAttributeDateTime.Type;

export const ProductAttributeTime = Schema.String.check(
  Schema.isPattern(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/u)
).pipe(Schema.brand("ProductAttributeTime"));
export type ProductAttributeTime = typeof ProductAttributeTime.Type;
