import {
  StoreConflict,
  StoreError,
  StoreVersion,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Effect, Layer, Option, Schema } from "effect";
import {
  apiRoot,
  apiRootWithoutConcurrentModificationRetry,
} from "../../client/api-root";

const NOT_FOUND_STATUS_CODE = 404;
const CONCURRENT_MODIFICATION_STATUS_CODE = 409;

class CommercetoolsRequestFailure extends Schema.TaggedErrorClass<CommercetoolsRequestFailure>()(
  "CommercetoolsRequestFailure",
  {
    message: Schema.String,
    cause: Schema.Defect,
  }
) {}

interface CommercetoolsCustomObject {
  readonly value: unknown;
  readonly version: number;
}

interface CommercetoolsCustomObjectPagedQueryResponse {
  readonly results: readonly CommercetoolsCustomObject[];
}

const CommercetoolsStatusCodeError = Schema.Struct({
  statusCode: Schema.Number,
});

const CommercetoolsCodeError = Schema.Struct({
  code: Schema.String,
});

const ErrorMessage = Schema.Struct({
  message: Schema.String,
});

const hasStatusCode = (error: unknown, statusCode: number) =>
  Option.match(
    Schema.decodeUnknownOption(CommercetoolsStatusCodeError)(
      commercetoolsFailureCause(error)
    ),
    {
      onNone: () => false,
      onSome: (decoded) => decoded.statusCode === statusCode,
    }
  );

const hasCode = (error: unknown, code: string) =>
  Option.match(
    Schema.decodeUnknownOption(CommercetoolsCodeError)(
      commercetoolsFailureCause(error)
    ),
    {
      onNone: () => false,
      onSome: (decoded) => decoded.code === code,
    }
  );

const isNotFoundError = (error: unknown) =>
  hasStatusCode(error, NOT_FOUND_STATUS_CODE);

const isConflictError = (error: unknown) =>
  hasStatusCode(error, CONCURRENT_MODIFICATION_STATUS_CODE) ||
  hasCode(error, "ConcurrentModification");

const storeError = (
  key: string,
  operation: StoreError["operation"],
  cause: unknown
) =>
  new StoreError({
    message: `Failed to ${operation} store value ${key}: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    key,
    operation,
    cause,
  });

const storeConflict = (
  key: string,
  operation: StoreConflict["operation"],
  cause: unknown
) =>
  new StoreConflict({
    message: `Store ${operation} conflict for ${key}: ${
      Option.getOrUndefined(Schema.decodeUnknownOption(ErrorMessage)(cause))
        ?.message ?? "Commercetools custom object version conflict"
    }`,
    key,
    operation,
  });

const commercetoolsFailureCause = (error: unknown) =>
  error instanceof CommercetoolsRequestFailure ? error.cause : error;

const versionFromCustomObject = (version: number) =>
  StoreVersion.make(String(version));

const versionToNumber = (key: string, version: StoreVersion) =>
  Effect.sync(() => Number(version)).pipe(
    Effect.flatMap((value) =>
      Number.isSafeInteger(value) && value > 0
        ? Effect.succeed(value)
        : Effect.fail(
            storeError(
              key,
              "update",
              new Error(
                `Invalid Commercetools custom object version ${version}`
              )
            )
          )
    )
  );

const encodeJsonValue = <S extends Schema.Top>(
  key: string,
  operation: "insert" | "update",
  schema: S,
  value: S["Type"]
) =>
  Schema.encodeEffect(Schema.toCodecJson(schema))(value).pipe(
    Effect.mapError((error) => storeError(key, operation, error))
  );

const decodeJsonValue = <S extends Schema.Top>(
  key: string,
  schema: S,
  value: unknown
) => {
  if (typeof value === "string") {
    return Effect.fail(
      storeError(
        key,
        "read",
        new Error("Expected custom object value to be JSON, received string")
      )
    );
  }

  return Schema.decodeUnknownEffect(Schema.toCodecJson(schema))(value).pipe(
    Effect.mapError((error) => storeError(key, "read", error))
  );
};

const readCustomObject = (container: string, key: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customObjects()
        .withContainerAndKey({ container, key })
        .get()
        .execute();

      return response.body as CommercetoolsCustomObject;
    },
    catch: (cause) =>
      new CommercetoolsRequestFailure({
        message: "Failed to read Commercetools custom object",
        cause,
      }),
  }).pipe(
    Effect.map(Option.some),
    Effect.catch((failure) =>
      isNotFoundError(failure)
        ? Effect.succeed(Option.none())
        : Effect.fail(
            storeError(key, "read", commercetoolsFailureCause(failure))
          )
    )
  );

const writeCustomObject = (
  container: string,
  key: string,
  version: number,
  value: unknown
) =>
  Effect.tryPromise({
    try: async () => {
      await apiRootWithoutConcurrentModificationRetry
        .customObjects()
        .post({
          body: {
            container,
            key,
            version,
            value,
          },
        })
        .execute();
    },
    catch: (cause) =>
      new CommercetoolsRequestFailure({
        message: "Failed to write Commercetools custom object",
        cause,
      }),
  });

const queryCustomObjects = (container: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customObjects()
        .withContainer({ container })
        .get({
          queryArgs: {
            limit: 500,
            withTotal: false,
          },
        })
        .execute();

      return response.body as CommercetoolsCustomObjectPagedQueryResponse;
    },
    catch: (error) => storeError(container, "read", error),
  });

export interface CommercetoolsCustomObjectKeyValueStoreOptions {
  readonly container: string;
}

export const layerCommercetoolsCustomObjectKeyValueStore = ({
  container,
}: CommercetoolsCustomObjectKeyValueStoreOptions) =>
  Layer.effect(
    VersionedKeyValueStore,
    Effect.gen(function* () {
      const get = Effect.fn("CommercetoolsCustomObjectKeyValueStore.get")(
        <S extends Schema.Top>(key: string, schema: S) =>
          readCustomObject(container, key).pipe(
            Effect.flatMap((customObject) =>
              Option.match(customObject, {
                onNone: () => Effect.succeed(Option.none()),
                onSome: (stored) =>
                  decodeJsonValue(key, schema, stored.value).pipe(
                    Effect.map((value) =>
                      Option.some({
                        value,
                        version: versionFromCustomObject(stored.version),
                      })
                    )
                  ),
              })
            )
          )
      );

      const insert = Effect.fn("CommercetoolsCustomObjectKeyValueStore.insert")(
        function* <S extends Schema.Top>(
          key: string,
          schema: S,
          value: S["Type"]
        ) {
          const encoded = yield* encodeJsonValue(key, "insert", schema, value);

          yield* writeCustomObject(container, key, 0, encoded).pipe(
            Effect.mapError((error) =>
              isConflictError(error)
                ? storeConflict(key, "insert", commercetoolsFailureCause(error))
                : storeError(key, "insert", commercetoolsFailureCause(error))
            )
          );
        }
      );

      const update = Effect.fn("CommercetoolsCustomObjectKeyValueStore.update")(
        function* <S extends Schema.Top>(
          key: string,
          schema: S,
          current: { readonly version: StoreVersion },
          next: S["Type"]
        ) {
          const version = yield* versionToNumber(key, current.version);
          const encoded = yield* encodeJsonValue(key, "update", schema, next);

          yield* writeCustomObject(container, key, version, encoded).pipe(
            Effect.mapError((error) =>
              isConflictError(error)
                ? storeConflict(key, "update", commercetoolsFailureCause(error))
                : storeError(key, "update", commercetoolsFailureCause(error))
            )
          );
        }
      );

      const values = Effect.fn("CommercetoolsCustomObjectKeyValueStore.values")(
        <S extends Schema.Top>(schema: S) =>
          queryCustomObjects(container).pipe(
            Effect.flatMap((response) =>
              Effect.forEach(
                response.results,
                (stored) =>
                  decodeJsonValue(container, schema, stored.value).pipe(
                    Effect.map((value) => ({
                      value,
                      version: versionFromCustomObject(stored.version),
                    }))
                  ),
                { concurrency: "unbounded" }
              )
            )
          )
      );

      return VersionedKeyValueStore.of({
        get,
        insert,
        update,
        values,
      });
    })
  );
