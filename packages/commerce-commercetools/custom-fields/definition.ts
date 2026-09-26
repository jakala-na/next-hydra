import { Schema } from "effect";

export type CustomTypeFields = Readonly<
  Record<PropertyKey, Schema.ConstraintCodec<unknown, unknown>>
>;

export type CustomTypeDefinition<
  TypeKey extends string,
  Fields extends CustomTypeFields,
> = {
  readonly fields: Fields;
  readonly schema: Schema.toCodecJson<Schema.Struct<Fields>>;
  readonly typeKey: TypeKey;
};

export type AnyCustomTypeDefinition = CustomTypeDefinition<
  string,
  CustomTypeFields
>;

export type CustomFieldName<Definition extends AnyCustomTypeDefinition> =
  Extract<keyof Definition["fields"], string>;

export type CustomFieldValue<
  Definition extends AnyCustomTypeDefinition,
  FieldName extends CustomFieldName<Definition>,
> = Definition["fields"][FieldName]["Type"];

export type CustomFieldValues<Definition extends AnyCustomTypeDefinition> =
  Definition["schema"]["Type"];

export const define = <
  const TypeKey extends string,
  const Fields extends CustomTypeFields,
>(input: {
  readonly fields: Fields;
  readonly typeKey: TypeKey;
}): CustomTypeDefinition<TypeKey, Fields> => ({
  fields: input.fields,
  schema: Schema.toCodecJson(Schema.Struct(input.fields)),
  typeKey: input.typeKey,
});

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

export const Date = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!ISO_DATE_PATTERN.test(value)) {
        return false;
      }
      const [year, month, day] = value.split("-").map(Number);
      return (
        year !== undefined &&
        month !== undefined &&
        day !== undefined &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= daysInMonth(year, month)
      );
    },
    { expected: "an ISO 8601 calendar date" }
  )
);

export const Time = Schema.String.check(
  Schema.isPattern(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/u)
);

export const Money = Schema.Struct({
  centAmount: Schema.Int,
  currencyCode: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  fractionDigits: Schema.optionalKey(Schema.Int),
  preciseAmount: Schema.optionalKey(Schema.Int),
  type: Schema.optionalKey(Schema.Literals(["centPrecision", "highPrecision"])),
});

export const reference = <const TypeId extends string>(typeId: TypeId) =>
  Schema.Struct({
    id: Schema.String,
    typeId: Schema.Literal(typeId),
  });
