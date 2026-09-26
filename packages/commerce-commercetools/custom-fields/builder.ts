import { Effect, Equal, Option, Schema } from "effect";

import type {
  AnyCustomTypeDefinition,
  CustomFieldName,
  CustomFieldValue,
  CustomFieldValues,
} from "./definition";
import {
  toGraphqlDraft as renderGraphqlDraft,
  toGraphqlUpdateActions as renderGraphqlUpdateActions,
} from "./graphql";
import type {
  GraphqlCustomFieldsDraft,
  GraphqlCustomFieldsUpdateAction,
} from "./graphql";
import { customFieldsReaderFromSource } from "./reader";
import {
  toRestDraft as renderRestDraft,
  toRestUpdateActions as renderRestUpdateActions,
} from "./rest";
import type {
  RestCustomFieldsDraft,
  RestCustomFieldsUpdateAction,
} from "./rest";
import { fromGraphql, fromRest } from "./source";
import type {
  CustomFieldsSource,
  GraphqlCustomFieldsInput,
  RestCustomFieldsInput,
} from "./source";

export type CustomFieldsDraft = {
  readonly fields: Readonly<Record<string, Schema.Json>>;
  readonly typeKey: string;
};

export type CustomFieldChange =
  | {
      readonly _tag: "Set";
      readonly name: string;
      readonly value: Schema.Json;
    }
  | {
      readonly _tag: "Unset";
      readonly name: string;
    };

export type CustomFieldsWritePlan =
  | { readonly _tag: "NoChange" }
  | {
      readonly _tag: "SetType";
      readonly fields: Readonly<Record<string, Schema.Json>>;
      readonly typeKey: string;
    }
  | {
      readonly _tag: "PatchFields";
      readonly changes: readonly CustomFieldChange[];
    };

export interface CustomFieldsUpdate<Error = Schema.SchemaError> {
  readonly mapError: <NextError>(
    map: (error: Error) => NextError
  ) => CustomFieldsUpdate<NextError>;
  readonly plan: Effect.Effect<CustomFieldsWritePlan, Error>;
  // oxlint-disable-next-line effecttsgo/lazy-effect -- Rendering remains a fluent finalizer over the shared lazy plan.
  readonly toGraphqlUpdateActions: () => Effect.Effect<
    GraphqlCustomFieldsUpdateAction[],
    Error
  >;
  // oxlint-disable-next-line effecttsgo/lazy-effect -- Rendering remains a fluent finalizer over the shared lazy plan.
  readonly toRestUpdateActions: () => Effect.Effect<
    readonly RestCustomFieldsUpdateAction[],
    Error
  >;
}

const projectUpdate = <Error>(
  plan: Effect.Effect<CustomFieldsWritePlan, Error>
): CustomFieldsUpdate<Error> => ({
  mapError: (map) => projectUpdate(plan.pipe(Effect.mapError(map))),
  plan,
  toGraphqlUpdateActions: () =>
    plan.pipe(Effect.map(renderGraphqlUpdateActions)),
  toRestUpdateActions: () => plan.pipe(Effect.map(renderRestUpdateActions)),
});

type SetIntent<Definition extends AnyCustomTypeDefinition> = {
  readonly _tag: "Set";
  readonly name: CustomFieldName<Definition>;
  readonly value: CustomFieldValue<Definition, CustomFieldName<Definition>>;
};

type Intent<Definition extends AnyCustomTypeDefinition> =
  | SetIntent<Definition>
  | { readonly _tag: "Unset"; readonly name: CustomFieldName<Definition> };

function fieldNames<Definition extends AnyCustomTypeDefinition>(
  definition: Definition
): readonly CustomFieldName<Definition>[] {
  // SAFETY: CustomFieldName is exactly the string-key view of definition.fields.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.keys(definition.fields) as CustomFieldName<Definition>[];
}

const encodeField = <Definition extends AnyCustomTypeDefinition>(
  definition: Definition,
  intent: SetIntent<Definition>
): Effect.Effect<Schema.Json, Schema.SchemaError> => {
  const field = definition.fields[intent.name];
  return Schema.encodeUnknownEffect(Schema.toCodecJson(field))(intent.value);
};

const encodeSetIntents = <Definition extends AnyCustomTypeDefinition>(
  definition: Definition,
  intents: ReadonlyMap<CustomFieldName<Definition>, Intent<Definition>>
): Effect.Effect<Readonly<Record<string, Schema.Json>>, Schema.SchemaError> =>
  Effect.forEach(
    [...intents.values()],
    (intent) =>
      intent._tag === "Unset"
        ? Effect.void.pipe(
            Effect.as<readonly [string, Schema.Json] | undefined>(undefined)
          )
        : encodeField(definition, intent).pipe(
            Effect.map(
              (value) =>
                [intent.name, value] as const satisfies readonly [
                  string,
                  Schema.Json,
                ]
            )
          ),
    { concurrency: "unbounded" }
  ).pipe(
    Effect.map((entries) =>
      Object.fromEntries(
        entries.filter(
          (entry): entry is readonly [string, Schema.Json] =>
            entry !== undefined
        )
      )
    )
  );

const fieldIsPresent = <Definition extends AnyCustomTypeDefinition>(
  values: CustomFieldValues<Definition>,
  name: CustomFieldName<Definition>
) => Object.hasOwn(values, name);

const planPatch = <Definition extends AnyCustomTypeDefinition>(
  definition: Definition,
  intents: ReadonlyMap<CustomFieldName<Definition>, Intent<Definition>>,
  values: CustomFieldValues<Definition>
) =>
  Effect.forEach([...intents.values()], (intent) => {
    if (intent._tag === "Unset") {
      return Effect.succeed<CustomFieldChange | undefined>(
        fieldIsPresent(values, intent.name)
          ? { _tag: "Unset", name: intent.name }
          : undefined
      );
    }
    return encodeField(definition, intent).pipe(
      Effect.map((encoded) =>
        fieldIsPresent(values, intent.name) &&
        Equal.equals(values[intent.name], intent.value)
          ? undefined
          : ({
              _tag: "Set",
              name: intent.name,
              value: encoded,
            } as const)
      )
    );
  }).pipe(
    Effect.map((changes) =>
      changes.filter(
        (change): change is CustomFieldChange => change !== undefined
      )
    ),
    Effect.map(
      (changes): CustomFieldsWritePlan =>
        changes.length === 0
          ? { _tag: "NoChange" }
          : { _tag: "PatchFields", changes }
    )
  );

export class CustomFieldsBuilder<Definition extends AnyCustomTypeDefinition> {
  readonly #definition: Definition;
  readonly #ensureType: boolean;
  readonly #intents: ReadonlyMap<
    CustomFieldName<Definition>,
    Intent<Definition>
  >;

  constructor(
    definition: Definition,
    intents: ReadonlyMap<
      CustomFieldName<Definition>,
      Intent<Definition>
    > = new Map(),
    ensureType = false
  ) {
    this.#definition = definition;
    this.#ensureType = ensureType;
    this.#intents = intents;
  }

  ensureType(): CustomFieldsBuilder<Definition> {
    return new CustomFieldsBuilder(this.#definition, this.#intents, true);
  }

  set<FieldName extends CustomFieldName<Definition>>(
    name: FieldName,
    value: CustomFieldValue<Definition, FieldName>
  ): CustomFieldsBuilder<Definition> {
    const intents = new Map<CustomFieldName<Definition>, Intent<Definition>>([
      ...this.#intents,
      [name, { _tag: "Set", name, value }] as const,
    ]);
    return new CustomFieldsBuilder(this.#definition, intents, this.#ensureType);
  }

  setAll(
    values: Partial<CustomFieldValues<Definition>>
  ): CustomFieldsBuilder<Definition> {
    const intents = new Map(this.#intents);
    for (const name of fieldNames(this.#definition)) {
      const value = values[name];
      if (value !== undefined) {
        intents.set(name, { _tag: "Set", name, value });
      }
    }
    return new CustomFieldsBuilder(this.#definition, intents, this.#ensureType);
  }

  unset(name: CustomFieldName<Definition>): CustomFieldsBuilder<Definition> {
    const intents = new Map<CustomFieldName<Definition>, Intent<Definition>>([
      ...this.#intents,
      [name, { _tag: "Unset", name }] as const,
    ]);
    return new CustomFieldsBuilder(this.#definition, intents, this.#ensureType);
  }

  toDraft(): Effect.Effect<CustomFieldsDraft, Schema.SchemaError> {
    return encodeSetIntents(this.#definition, this.#intents).pipe(
      Effect.tap((fields) =>
        Schema.decodeEffect(this.#definition.schema)(fields)
      ),
      Effect.map((fields) => ({
        fields,
        typeKey: this.#definition.typeKey,
      }))
    );
  }

  toGraphqlDraft(): Effect.Effect<
    GraphqlCustomFieldsDraft,
    Schema.SchemaError
  > {
    return this.toDraft().pipe(Effect.map(renderGraphqlDraft));
  }

  toRestDraft(): Effect.Effect<RestCustomFieldsDraft, Schema.SchemaError> {
    return this.toDraft().pipe(Effect.map(renderRestDraft));
  }

  againstGraphql(
    custom: GraphqlCustomFieldsInput | null | undefined
  ): CustomFieldsUpdate {
    return projectUpdate(this.#plan(fromGraphql(custom)));
  }

  againstRest(
    custom: RestCustomFieldsInput | null | undefined
  ): CustomFieldsUpdate {
    return projectUpdate(this.#plan(fromRest(custom)));
  }

  #plan(
    source: CustomFieldsSource
  ): Effect.Effect<CustomFieldsWritePlan, Schema.SchemaError> {
    const reader = customFieldsReaderFromSource(this.#definition, source);
    return reader.read.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => {
            const hasSet = [...this.#intents.values()].some(
              (intent) => intent._tag === "Set"
            );
            if (!(hasSet || this.#ensureType)) {
              return Effect.succeed<CustomFieldsWritePlan>({
                _tag: "NoChange",
              });
            }
            return this.toDraft().pipe(
              Effect.map(
                (draft): CustomFieldsWritePlan => ({
                  _tag: "SetType",
                  fields: draft.fields,
                  typeKey: draft.typeKey,
                })
              )
            );
          },
          onSome: (values) =>
            planPatch(this.#definition, this.#intents, values),
        })
      )
    );
  }
}

export const customFieldsBuilder = {
  forType: <Definition extends AnyCustomTypeDefinition>(
    definition: Definition
  ) => new CustomFieldsBuilder(definition),
};
