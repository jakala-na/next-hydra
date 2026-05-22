import {
  Context,
  Effect,
  Layer,
  Option,
  Schema,
  SynchronizedRef,
} from "effect";

export const StoreVersion = Schema.String.pipe(Schema.brand("StoreVersion"));
export type StoreVersion = typeof StoreVersion.Type;

export interface Versioned<A> {
  readonly value: A;
  readonly version: StoreVersion;
}

export class StoreConflict extends Schema.TaggedErrorClass<StoreConflict>()(
  "StoreConflict",
  {
    key: Schema.String,
    operation: Schema.Literals(["insert", "update"]),
    reason: Schema.String,
  }
) {}

export class StoreError extends Schema.TaggedErrorClass<StoreError>()(
  "StoreError",
  {
    key: Schema.String,
    operation: Schema.Literals(["read", "insert", "update"]),
    cause: Schema.Defect,
  }
) {}

interface StoredValue {
  readonly encoded: string;
  readonly revision: number;
  readonly version: StoreVersion;
}

type Store = ReadonlyMap<string, StoredValue>;

const versionFromRevision = (revision: number) =>
  StoreVersion.make(String(revision));

const storeError = (
  key: string,
  operation: StoreError["operation"],
  cause: unknown
) =>
  new StoreError({
    key,
    operation,
    cause,
  });

export const encodeJsonString = <S extends Schema.Top>(
  schema: S,
  value: S["Type"]
) => {
  const jsonSchema = Schema.fromJsonString(Schema.toCodecJson(schema));

  return Schema.encodeEffect(jsonSchema)(value);
};

export const decodeJsonString = <S extends Schema.Top>(
  schema: S,
  value: string
) => {
  const jsonSchema = Schema.fromJsonString(Schema.toCodecJson(schema));

  return Schema.decodeEffect(jsonSchema)(value);
};

const encodeValue = <S extends Schema.Top>(
  key: string,
  operation: "insert" | "update",
  schema: S,
  value: S["Type"]
) => {
  return encodeJsonString(schema, value).pipe(
    Effect.mapError((error) => storeError(key, operation, error))
  );
};

const decodeValue = <S extends Schema.Top>(
  key: string,
  schema: S,
  stored: StoredValue
) => {
  return decodeJsonString(schema, stored.encoded).pipe(
    Effect.map((value) => ({ value, version: stored.version })),
    Effect.mapError((error) => storeError(key, "read", error))
  );
};

export class VersionedKeyValueStore extends Context.Service<
  VersionedKeyValueStore,
  {
    readonly get: <S extends Schema.Top>(
      key: string,
      schema: S
    ) => Effect.Effect<
      Option.Option<Versioned<S["Type"]>>,
      StoreError,
      S["DecodingServices"]
    >;
    readonly insert: <S extends Schema.Top>(
      key: string,
      schema: S,
      value: S["Type"]
    ) => Effect.Effect<
      void,
      StoreConflict | StoreError,
      S["DecodingServices"] | S["EncodingServices"]
    >;
    readonly update: <S extends Schema.Top>(
      key: string,
      schema: S,
      current: Versioned<S["Type"]>,
      next: S["Type"]
    ) => Effect.Effect<
      void,
      StoreConflict | StoreError,
      S["DecodingServices"] | S["EncodingServices"]
    >;
    readonly values: <S extends Schema.Top>(
      schema: S
    ) => Effect.Effect<
      readonly Versioned<S["Type"]>[],
      StoreError,
      S["DecodingServices"]
    >;
  }
>()("@repo/registration-effect/VersionedKeyValueStore") {
  static readonly layerMemory = Layer.effect(
    VersionedKeyValueStore,
    Effect.gen(function* () {
      const store = yield* SynchronizedRef.make<Store>(new Map());

      const get = Effect.fn("VersionedKeyValueStore.get")(
        <S extends Schema.Top>(key: string, schema: S) =>
          SynchronizedRef.get(store).pipe(
            Effect.flatMap((entries) => {
              const stored = entries.get(key);

              if (!stored) {
                return Effect.succeed(Option.none());
              }

              return decodeValue(key, schema, stored).pipe(
                Effect.map(Option.some)
              );
            })
          )
      );

      const insert = Effect.fn("VersionedKeyValueStore.insert")(function* <
        S extends Schema.Top,
      >(key: string, schema: S, value: S["Type"]) {
        const encoded = yield* encodeValue(key, "insert", schema, value);
        const stored: StoredValue = {
          encoded,
          revision: 1,
          version: versionFromRevision(1),
        };

        yield* SynchronizedRef.updateEffect(store, (entries) => {
          if (entries.has(key)) {
            return Effect.fail(
              new StoreConflict({
                key,
                operation: "insert",
                reason: "Key already exists",
              })
            );
          }

          return Effect.succeed(new Map(entries).set(key, stored));
        });
      });

      const update = Effect.fn("VersionedKeyValueStore.update")(function* <
        S extends Schema.Top,
      >(
        key: string,
        schema: S,
        current: Versioned<S["Type"]>,
        next: S["Type"]
      ) {
        const encoded = yield* encodeValue(key, "update", schema, next);

        yield* SynchronizedRef.updateEffect(store, (entries) => {
          const stored = entries.get(key);

          if (!stored || stored.version !== current.version) {
            return Effect.fail(
              new StoreConflict({
                key,
                operation: "update",
                reason: "Stored version does not match current version",
              })
            );
          }

          const revision = stored.revision + 1;
          const updated: StoredValue = {
            encoded,
            revision,
            version: versionFromRevision(revision),
          };

          return Effect.succeed(new Map(entries).set(key, updated));
        });
      });

      const values = Effect.fn("VersionedKeyValueStore.values")(
        <S extends Schema.Top>(schema: S) =>
          SynchronizedRef.get(store).pipe(
            Effect.flatMap((entries) =>
              Effect.forEach(
                entries,
                ([key, stored]) => decodeValue(key, schema, stored),
                { concurrency: "unbounded" }
              )
            )
          )
      );

      return {
        get,
        insert,
        update,
        values,
      };
    })
  );
}
