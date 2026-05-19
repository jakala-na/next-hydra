import {
  decodeJsonString,
  encodeJsonString,
  StoreConflict,
  StoreError,
  StoreVersion,
  VersionedKeyValueStore,
} from "@repo/registration-effect/services/versioned-key-value-store";
import { Effect, Layer, Option, type Schema } from "effect";
import {
  apiRoot,
  apiRootWithoutConcurrentModificationRetry,
} from "../../client/api-root";

const NOT_FOUND_STATUS_CODE = 404;
const CONCURRENT_MODIFICATION_STATUS_CODE = 409;

interface CommercetoolsCustomObject {
  readonly value: unknown;
  readonly version: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasStatusCode = (error: unknown, statusCode: number) =>
  isObject(error) && error.statusCode === statusCode;

const hasCode = (error: unknown, code: string) =>
  isObject(error) && error.code === code;

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
    key,
    operation,
    reason:
      isObject(cause) && typeof cause.message === "string"
        ? cause.message
        : "Commercetools custom object version conflict",
  });

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
    catch: (error) => error,
  }).pipe(
    Effect.map(Option.some),
    Effect.catch((error) =>
      isNotFoundError(error)
        ? Effect.succeed(Option.none())
        : Effect.fail(storeError(key, "read", error))
    )
  );

const writeCustomObject = (
  container: string,
  key: string,
  version: number,
  value: string
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
    catch: (error) => error,
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
                onSome: (stored) => {
                  if (typeof stored.value !== "string") {
                    return Effect.fail(
                      storeError(
                        key,
                        "read",
                        new Error(
                          "Expected custom object value to be a JSON string"
                        )
                      )
                    );
                  }

                  return decodeJsonString(schema, stored.value).pipe(
                    Effect.map((value) =>
                      Option.some({
                        value,
                        version: versionFromCustomObject(stored.version),
                      })
                    ),
                    Effect.mapError((error) => storeError(key, "read", error))
                  );
                },
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
          const encoded = yield* encodeJsonString(schema, value).pipe(
            Effect.mapError((error) => storeError(key, "insert", error))
          );

          yield* writeCustomObject(container, key, 0, encoded).pipe(
            Effect.mapError((error) =>
              isConflictError(error)
                ? storeConflict(key, "insert", error)
                : storeError(key, "insert", error)
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
          const encoded = yield* encodeJsonString(schema, next).pipe(
            Effect.mapError((error) => storeError(key, "update", error))
          );

          yield* writeCustomObject(container, key, version, encoded).pipe(
            Effect.mapError((error) =>
              isConflictError(error)
                ? storeConflict(key, "update", error)
                : storeError(key, "update", error)
            )
          );
        }
      );

      return VersionedKeyValueStore.of({
        get,
        insert,
        update,
      });
    })
  );
