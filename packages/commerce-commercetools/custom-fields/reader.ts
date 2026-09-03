import { Effect, Option, Schema } from "effect";

import type {
  AnyCustomTypeDefinition,
  CustomFieldName,
  CustomFieldValue,
  CustomFieldValues,
} from "./definition";
import type {
  CustomFieldRaw,
  CustomFieldsSource,
  GraphqlCustomFieldsInput,
  NormalizedCustomFields,
  RestCustomFieldsInput,
} from "./source";
import {
  fromGraphql as graphqlSource,
  fromRest as restSource,
  normalize,
} from "./source";

type LocalizedValue = Readonly<Record<string, string>>;

export type LocalizedCustomFieldName<
  Definition extends AnyCustomTypeDefinition,
> = {
  [FieldName in CustomFieldName<Definition>]: Exclude<
    CustomFieldValue<Definition, FieldName>,
    undefined
  > extends LocalizedValue
    ? FieldName
    : never;
}[CustomFieldName<Definition>];

export type CustomFieldResolveContext<Value> = {
  readonly rawField: CustomFieldRaw;
  readonly referencedResource: Schema.Json | undefined;
  readonly referencedResourceSet: readonly Schema.Json[];
  readonly value: Value;
};

export type CustomFieldResolver<Value, Output, Error, Services> = (
  context: CustomFieldResolveContext<Value>
) => Effect.Effect<Output, Error, Services>;

type DecodedDocument<Definition extends AnyCustomTypeDefinition> = {
  readonly normalized: NormalizedCustomFields;
  readonly values: CustomFieldValues<Definition>;
};

type SelectedField<Name extends PropertyKey, Value> = Readonly<
  Partial<Record<Name, Value>>
>;

export interface CustomFieldsProjection<
  Definition extends AnyCustomTypeDefinition,
  Output extends object,
  Error = never,
  Services = never,
> {
  readonly pick: {
    <FieldName extends CustomFieldName<Definition>>(
      fieldName: FieldName
    ): PendingCustomFieldsProjection<
      Definition,
      Output,
      Error,
      Services,
      FieldName,
      CustomFieldValue<Definition, FieldName>
    >;
    <
      FieldName extends CustomFieldName<Definition>,
      Resolved,
      NextError,
      NextServices,
    >(
      fieldName: FieldName,
      options: {
        readonly resolve: CustomFieldResolver<
          CustomFieldValue<Definition, FieldName>,
          Resolved,
          NextError,
          NextServices
        >;
      }
    ): PendingCustomFieldsProjection<
      Definition,
      Output,
      Error | NextError,
      Services | NextServices,
      FieldName,
      Resolved
    >;
  };
  // oxlint-disable-next-line effecttsgo/lazy-effect -- Finalization as a method preserves the fluent projection API while the returned Effect remains lazy.
  readonly toValues: () => Effect.Effect<
    Output,
    Error | Schema.SchemaError,
    Services
  >;
}

export interface PendingCustomFieldsProjection<
  Definition extends AnyCustomTypeDefinition,
  Output extends object,
  Error,
  Services,
  FieldName extends CustomFieldName<Definition>,
  Value,
> extends CustomFieldsProjection<
  Definition,
  Output & SelectedField<FieldName, Value>,
  Error,
  Services
> {
  readonly as: <Alias extends string>(
    alias: Alias
  ) => CustomFieldsProjection<
    Definition,
    Output & SelectedField<Alias, Value>,
    Error,
    Services
  >;
}

const validateTypeKey = (
  typeKey: string,
  normalized: NormalizedCustomFields
): Effect.Effect<void, Schema.SchemaError> =>
  normalized.typeKey === undefined
    ? Effect.void
    : Schema.decodeEffect(Schema.Literal(typeKey))(normalized.typeKey).pipe(
        Effect.asVoid
      );

const decodeDocument = <Definition extends AnyCustomTypeDefinition>(
  definition: Definition,
  source: CustomFieldsSource
): Effect.Effect<
  Option.Option<DecodedDocument<Definition>>,
  Schema.SchemaError
> =>
  normalize(source).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none()),
        onSome: (normalized) =>
          validateTypeKey(definition.typeKey, normalized).pipe(
            Effect.andThen(
              Schema.decodeEffect(definition.schema)(normalized.fields)
            ),
            Effect.map(
              (values): DecodedDocument<Definition> => ({
                normalized,
                values,
              })
            ),
            Effect.map(Option.some)
          ),
      })
    )
  );

const fieldFrom = <
  Definition extends AnyCustomTypeDefinition,
  FieldName extends CustomFieldName<Definition>,
>(
  document: DecodedDocument<Definition>,
  fieldName: FieldName
): Option.Option<CustomFieldValue<Definition, FieldName>> =>
  Object.hasOwn(document.values, fieldName)
    ? Option.some(document.values[fieldName])
    : Option.none();

export interface CustomFieldsReader<
  Definition extends AnyCustomTypeDefinition,
> {
  readonly get: {
    <FieldName extends CustomFieldName<Definition>>(
      fieldName: FieldName
    ): Effect.Effect<
      Option.Option<CustomFieldValue<Definition, FieldName>>,
      Schema.SchemaError
    >;
    <FieldName extends CustomFieldName<Definition>, Output, Error, Services>(
      fieldName: FieldName,
      options: {
        readonly resolve: CustomFieldResolver<
          CustomFieldValue<Definition, FieldName>,
          Output,
          Error,
          Services
        >;
      }
    ): Effect.Effect<
      Option.Option<Output>,
      Error | Schema.SchemaError,
      Services
    >;
  };
  readonly getLocalized: (
    fieldName: LocalizedCustomFieldName<Definition>,
    locale: string,
    fallbackLocale?: string
  ) => Effect.Effect<Option.Option<string>, Schema.SchemaError>;
  readonly read: Effect.Effect<
    Option.Option<CustomFieldValues<Definition>>,
    Schema.SchemaError
  >;
  readonly pick: CustomFieldsProjection<
    Definition,
    Readonly<Record<never, never>>
  >["pick"];
}

const LocalizedValue = Schema.Record(Schema.String, Schema.String);

const isNonBlank = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const localize = (
  value: LocalizedValue,
  locale: string,
  fallbackLocale?: string
): Option.Option<string> => {
  const preferred = [
    value[locale],
    fallbackLocale === undefined ? undefined : value[fallbackLocale],
  ].find(isNonBlank);
  if (preferred !== undefined) {
    return Option.some(preferred);
  }

  return Option.fromNullishOr(Object.values(value).find(isNonBlank));
};

const makeReader = <Definition extends AnyCustomTypeDefinition>(
  definition: Definition,
  source: CustomFieldsSource
): CustomFieldsReader<Definition> => {
  const document = decodeDocument(definition, source);

  function get<FieldName extends CustomFieldName<Definition>>(
    fieldName: FieldName
  ): Effect.Effect<
    Option.Option<CustomFieldValue<Definition, FieldName>>,
    Schema.SchemaError
  >;
  function get<
    FieldName extends CustomFieldName<Definition>,
    Output,
    Error,
    Services,
  >(
    fieldName: FieldName,
    options: {
      readonly resolve: CustomFieldResolver<
        CustomFieldValue<Definition, FieldName>,
        Output,
        Error,
        Services
      >;
    }
  ): Effect.Effect<Option.Option<Output>, Error | Schema.SchemaError, Services>;
  function get<
    FieldName extends CustomFieldName<Definition>,
    Output = CustomFieldValue<Definition, FieldName>,
    Error = never,
    Services = never,
  >(
    fieldName: FieldName,
    options?: {
      readonly resolve: CustomFieldResolver<
        CustomFieldValue<Definition, FieldName>,
        Output,
        Error,
        Services
      >;
    }
  ) {
    if (options === undefined) {
      return document.pipe(
        Effect.map(Option.flatMap((decoded) => fieldFrom(decoded, fieldName)))
      );
    }

    return document.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none()),
          onSome: (decoded) =>
            fieldFrom(decoded, fieldName).pipe(
              Option.match({
                onNone: () => Effect.succeed(Option.none()),
                onSome: (value) => {
                  const rawField = decoded.normalized.rawFields.get(fieldName);
                  if (rawField === undefined) {
                    return Effect.succeed(Option.none());
                  }
                  return options
                    .resolve({
                      rawField,
                      referencedResource: rawField.referencedResource,
                      referencedResourceSet:
                        rawField.referencedResourceSet ?? [],
                      value,
                    })
                    .pipe(Effect.map(Option.some));
                },
              })
            ),
        })
      )
    );
  }

  const addProjectedField = <
    Output extends object,
    Alias extends string,
    Value,
    Error,
    Services,
    FieldError,
    FieldServices,
  >(
    values: Effect.Effect<Output, Error | Schema.SchemaError, Services>,
    field: Effect.Effect<
      Option.Option<Value>,
      FieldError | Schema.SchemaError,
      FieldServices
    >,
    alias: Alias
  ): Effect.Effect<
    Output & SelectedField<Alias, Value>,
    Error | FieldError | Schema.SchemaError,
    Services | FieldServices
  > =>
    Effect.all([values, field]).pipe(
      Effect.map(([current, selected]) => {
        const projected = Option.isNone(selected)
          ? current
          : { ...current, [alias]: selected.value };
        // SAFETY: the selected value is assigned only to the Alias captured by
        // the typed pick/as call, and absence leaves the optional field omitted.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return projected as Output & SelectedField<Alias, Value>;
      })
    );

  const makeProjection = <Output extends object, Error, Services>(
    values: Effect.Effect<Output, Error | Schema.SchemaError, Services>
  ): CustomFieldsProjection<Definition, Output, Error, Services> => {
    function pick<FieldName extends CustomFieldName<Definition>>(
      fieldName: FieldName
    ): PendingCustomFieldsProjection<
      Definition,
      Output,
      Error,
      Services,
      FieldName,
      CustomFieldValue<Definition, FieldName>
    >;
    function pick<
      FieldName extends CustomFieldName<Definition>,
      Resolved,
      NextError,
      NextServices,
    >(
      fieldName: FieldName,
      options: {
        readonly resolve: CustomFieldResolver<
          CustomFieldValue<Definition, FieldName>,
          Resolved,
          NextError,
          NextServices
        >;
      }
    ): PendingCustomFieldsProjection<
      Definition,
      Output,
      Error | NextError,
      Services | NextServices,
      FieldName,
      Resolved
    >;
    function pick<
      FieldName extends CustomFieldName<Definition>,
      Resolved = CustomFieldValue<Definition, FieldName>,
      NextError = never,
      NextServices = never,
    >(
      fieldName: FieldName,
      options?: {
        readonly resolve: CustomFieldResolver<
          CustomFieldValue<Definition, FieldName>,
          Resolved,
          NextError,
          NextServices
        >;
      }
    ) {
      if (options === undefined) {
        // oxlint-disable-next-line eslint/no-use-before-define -- The immutable projection factories recurse only after both have initialized.
        return makePendingProjection<
          Output,
          FieldName,
          CustomFieldValue<Definition, FieldName>,
          Error,
          Services,
          never,
          never
        >(values, get(fieldName), fieldName);
      }
      // oxlint-disable-next-line eslint/no-use-before-define -- The immutable projection factories recurse only after both have initialized.
      return makePendingProjection<
        Output,
        FieldName,
        Resolved,
        Error,
        Services,
        NextError,
        NextServices
      >(values, get(fieldName, options), fieldName);
    }

    return { pick, toValues: () => values };
  };

  const makePendingProjection = <
    Output extends object,
    FieldName extends CustomFieldName<Definition>,
    Value,
    Error,
    Services,
    FieldError,
    FieldServices,
  >(
    values: Effect.Effect<Output, Error | Schema.SchemaError, Services>,
    field: Effect.Effect<
      Option.Option<Value>,
      FieldError | Schema.SchemaError,
      FieldServices
    >,
    fieldName: FieldName
  ): PendingCustomFieldsProjection<
    Definition,
    Output,
    Error | FieldError,
    Services | FieldServices,
    FieldName,
    Value
  > => {
    const projectAs = <Alias extends string>(alias: Alias) =>
      makeProjection<
        Output & SelectedField<Alias, Value>,
        Error | FieldError,
        Services | FieldServices
      >(addProjectedField(values, field, alias));
    return { ...projectAs(fieldName), as: projectAs };
  };

  const projection = makeProjection(
    Effect.succeed<Readonly<Record<never, never>>>({})
  );

  const getLocalized = (
    fieldName: LocalizedCustomFieldName<Definition>,
    locale: string,
    fallbackLocale?: string
  ) =>
    get(fieldName).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none<string>()),
          onSome: (value) =>
            Schema.decodeUnknownEffect(LocalizedValue)(value).pipe(
              Effect.map((localized) =>
                localize(localized, locale, fallbackLocale)
              )
            ),
        })
      )
    );

  return {
    get,
    getLocalized,
    pick: projection.pick,
    read: document.pipe(Effect.map(Option.map((decoded) => decoded.values))),
  };
};

export const customFieldsReaderFromSource = makeReader;

export const customFieldsReader = {
  fromGraphql: <Definition extends AnyCustomTypeDefinition>(
    definition: Definition,
    custom: GraphqlCustomFieldsInput | null | undefined
  ) => makeReader(definition, graphqlSource(custom)),
  fromRest: <Definition extends AnyCustomTypeDefinition>(
    definition: Definition,
    custom: RestCustomFieldsInput | null | undefined
  ) => makeReader(definition, restSource(custom)),
};
