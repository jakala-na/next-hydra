import { Effect, Option, Schema } from "effect";

export const REST_CUSTOM_TYPE_EXPANSION = "custom.type";

export type CustomFieldRaw = {
  readonly name: string;
  readonly referencedResource?: Schema.Json;
  readonly referencedResourceSet?: readonly Schema.Json[];
  readonly value: Schema.Json;
};

type GraphqlCustomFieldInput = {
  readonly name: string;
  readonly referencedResource?: unknown;
  readonly referencedResourceSet?: readonly unknown[];
  readonly value: unknown;
};

export type GraphqlCustomFieldsInput = {
  readonly customFieldsRaw?: readonly GraphqlCustomFieldInput[] | null;
  readonly type?: { readonly key?: string | null } | null;
};

export type RestCustomFieldsInput = {
  readonly fields: Schema.JsonObject;
  readonly type?: {
    readonly id?: string;
    readonly key?: string;
    readonly obj?: { readonly key?: string };
    readonly typeId?: string;
  };
};

export type CustomFieldsSource =
  | {
      readonly _tag: "Graphql";
      readonly custom: GraphqlCustomFieldsInput | null | undefined;
    }
  | {
      readonly _tag: "Rest";
      readonly custom: RestCustomFieldsInput | null | undefined;
    };

export type NormalizedCustomFields = {
  readonly fields: Schema.JsonObject;
  readonly rawFields: ReadonlyMap<string, CustomFieldRaw>;
  readonly typeKey?: string;
};

const GraphqlRawField = Schema.Struct({
  name: Schema.String,
  referencedResource: Schema.optionalKey(Schema.Json),
  referencedResourceSet: Schema.optionalKey(Schema.Array(Schema.Json)),
  value: Schema.Json,
});

const GraphqlCustom = Schema.NullishOr(
  Schema.Struct({
    customFieldsRaw: Schema.NullishOr(Schema.Array(GraphqlRawField)),
    type: Schema.Struct({ key: Schema.String }),
  })
).check(
  Schema.makeFilter(
    (custom) => {
      const fields = custom?.customFieldsRaw;
      return (
        fields === null ||
        fields === undefined ||
        new Set(fields.map((field) => field.name)).size === fields.length
      );
    },
    { expected: "unique Custom Field names" }
  )
);

const RestCustom = Schema.NullishOr(
  Schema.Struct({
    fields: Schema.Record(Schema.String, Schema.Json),
    type: Schema.Union([
      Schema.Struct({ key: Schema.String }),
      Schema.Struct({
        id: Schema.String,
        obj: Schema.Struct({ key: Schema.String }),
        typeId: Schema.Literal("type"),
      }),
    ]),
  })
);

const EnumValue = Schema.Union([
  Schema.Struct({ key: Schema.String, label: Schema.String }),
  Schema.Struct({
    key: Schema.String,
    label: Schema.Record(Schema.String, Schema.String),
  }),
]);

const decodeEnumValue = Schema.decodeUnknownOption(EnumValue);

const normalizeValue = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  return Option.match(decodeEnumValue(value), {
    onNone: () => value,
    onSome: (enumValue) => enumValue.key,
  });
};

const normalizeGraphql = (
  custom: GraphqlCustomFieldsInput | null | undefined
) =>
  Schema.decodeUnknownEffect(GraphqlCustom)(custom).pipe(
    Effect.map((decoded) => {
      if (decoded === null || decoded === undefined) {
        return Option.none<NormalizedCustomFields>();
      }

      const fields: Record<string, Schema.Json> = {};
      const rawFields = new Map<string, CustomFieldRaw>();
      for (const field of decoded.customFieldsRaw ?? []) {
        fields[field.name] = normalizeValue(field.value);
        rawFields.set(field.name, field);
      }

      return Option.some({
        fields,
        rawFields,
        typeKey: decoded.type.key,
      });
    })
  );

const normalizeRest = (custom: RestCustomFieldsInput | null | undefined) =>
  Schema.decodeUnknownEffect(RestCustom)(custom).pipe(
    Effect.map((decoded) => {
      if (decoded === null || decoded === undefined) {
        return Option.none<NormalizedCustomFields>();
      }
      const fields: Record<string, Schema.Json> = {};
      const rawFields = new Map<string, CustomFieldRaw>();
      for (const [name, value] of Object.entries(decoded.fields)) {
        fields[name] = normalizeValue(value);
        rawFields.set(name, { name, value });
      }
      return Option.some({
        fields,
        rawFields,
        typeKey:
          "key" in decoded.type ? decoded.type.key : decoded.type.obj.key,
      });
    })
  );

export const fromGraphql = (
  custom: GraphqlCustomFieldsInput | null | undefined
): CustomFieldsSource => ({
  _tag: "Graphql",
  custom,
});

export const fromRest = (
  custom: RestCustomFieldsInput | null | undefined
): CustomFieldsSource => ({ _tag: "Rest", custom });

export const normalize = (
  source: CustomFieldsSource
): Effect.Effect<Option.Option<NormalizedCustomFields>, Schema.SchemaError> =>
  source._tag === "Graphql"
    ? normalizeGraphql(source.custom)
    : normalizeRest(source.custom);
