import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import {
  StoreConflict,
  StoreError,
  StoreVersion,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Effect, Layer, Option, Schema } from "effect";

import { commercetoolsClientsLayer } from "../client/layers";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  commercetoolsFailureCause,
  commercetoolsRequest,
  isConcurrentModification,
} from "../client/versioned-write";

const NOT_FOUND_STATUS_CODE = 404;

const CommercetoolsStatusCodeError = Schema.Struct({
  statusCode: Schema.Number,
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

const isNotFoundError = (error: unknown) =>
  hasStatusCode(error, NOT_FOUND_STATUS_CODE);

const storeError = (
  key: string,
  operation: StoreError["operation"],
  cause: unknown,
  reason: StoreError["reason"] = "invalidData"
) =>
  new StoreError({
    cause,
    key,
    message: `Failed to ${operation} store value ${key}: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    reason,
  });

const storeConflict = (
  key: string,
  operation: StoreConflict["operation"],
  cause: unknown
) =>
  new StoreConflict({
    key,
    message: `Store ${operation} conflict for ${key}: ${
      Option.getOrUndefined(Schema.decodeUnknownOption(ErrorMessage)(cause))
        ?.message ?? "Commercetools custom object version conflict"
    }`,
    operation,
  });

const versionFromCustomObject = (version: number) =>
  StoreVersion.make(String(version));

const versionToNumber = (
  key: string,
  operation: "remove" | "update",
  version: StoreVersion
) =>
  Effect.sync(() => Number(version)).pipe(
    Effect.flatMap((value) =>
      Number.isSafeInteger(value) && value > 0
        ? Effect.succeed(value)
        : Effect.fail(
            storeError(
              key,
              operation,
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

const readCustomObject = (
  apiRoot: ByProjectKeyRequestBuilder,
  container: string,
  key: string
) =>
  commercetoolsRequest(
    "Failed to read Commercetools custom object",
    async () => {
      const response = await apiRoot
        .customObjects()
        .withContainerAndKey({ container, key })
        .get()
        .execute();

      return response.body;
    }
  ).pipe(
    Effect.map(Option.some),
    Effect.catch((error) =>
      isNotFoundError(error)
        ? Effect.succeed(Option.none())
        : Effect.fail(
            storeError(
              key,
              "read",
              commercetoolsFailureCause(error),
              commercetoolsProviderFailureReason(
                commercetoolsFailureCause(error)
              )
            )
          )
    )
  );

const writeCustomObject = (
  apiRoot: ByProjectKeyRequestBuilder,
  container: string,
  key: string,
  version: number,
  value: unknown
) =>
  commercetoolsRequest(
    "Failed to write Commercetools custom object",
    async () => {
      await apiRoot
        .customObjects()
        .post({
          body: {
            container,
            key,
            value,
            version,
          },
        })
        .execute();
    }
  );

const removeCustomObject = (
  apiRoot: ByProjectKeyRequestBuilder,
  container: string,
  key: string,
  version: number
) =>
  commercetoolsRequest(
    "Failed to remove Commercetools custom object",
    async () => {
      await apiRoot
        .customObjects()
        .withContainerAndKey({ container, key })
        .delete({ queryArgs: { version } })
        .execute();
    }
  );

const queryCustomObjects = (
  apiRoot: ByProjectKeyRequestBuilder,
  container: string
) =>
  commercetoolsRequest(
    "Failed to query Commercetools custom objects",
    async () => {
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

      return response.body;
    }
  ).pipe(
    Effect.mapError((error) =>
      storeError(
        container,
        "read",
        commercetoolsFailureCause(error),
        commercetoolsProviderFailureReason(commercetoolsFailureCause(error))
      )
    )
  );

export interface VersionedKeyValueStoreLayerOptions {
  readonly container: string;
}

const versionedKeyValueStoreImplementationLayer = ({
  container,
}: VersionedKeyValueStoreLayerOptions) =>
  Layer.effect(
    VersionedKeyValueStore,
    Effect.gen(function* () {
      const { apiRoot } = yield* CommercetoolsRestClient;

      const get = Effect.fn("CommercetoolsCustomObjectKeyValueStore.get")(
        <S extends Schema.Top>(key: string, schema: S) =>
          readCustomObject(apiRoot, container, key).pipe(
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

          yield* writeCustomObject(apiRoot, container, key, 0, encoded).pipe(
            Effect.mapError((error) =>
              isConcurrentModification(error)
                ? storeConflict(key, "insert", commercetoolsFailureCause(error))
                : storeError(
                    key,
                    "insert",
                    commercetoolsFailureCause(error),
                    commercetoolsProviderFailureReason(
                      commercetoolsFailureCause(error)
                    )
                  )
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
          const version = yield* versionToNumber(
            key,
            "update",
            current.version
          );
          const encoded = yield* encodeJsonValue(key, "update", schema, next);

          yield* writeCustomObject(
            apiRoot,
            container,
            key,
            version,
            encoded
          ).pipe(
            Effect.mapError((error) =>
              isConcurrentModification(error)
                ? storeConflict(key, "update", commercetoolsFailureCause(error))
                : storeError(
                    key,
                    "update",
                    commercetoolsFailureCause(error),
                    commercetoolsProviderFailureReason(
                      commercetoolsFailureCause(error)
                    )
                  )
            )
          );
        }
      );

      const remove = Effect.fn("CommercetoolsCustomObjectKeyValueStore.remove")(
        function* (key: string, current: { readonly version: StoreVersion }) {
          const version = yield* versionToNumber(
            key,
            "remove",
            current.version
          );

          yield* removeCustomObject(apiRoot, container, key, version).pipe(
            Effect.catch((error) => {
              const cause = commercetoolsFailureCause(error);

              if (isNotFoundError(error)) {
                return Effect.void;
              }

              return Effect.fail(
                isConcurrentModification(error)
                  ? storeConflict(key, "remove", cause)
                  : storeError(
                      key,
                      "remove",
                      cause,
                      commercetoolsProviderFailureReason(cause)
                    )
              );
            })
          );
        }
      );

      const values = Effect.fn("CommercetoolsCustomObjectKeyValueStore.values")(
        <S extends Schema.Top>(schema: S) =>
          queryCustomObjects(apiRoot, container).pipe(
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
        remove,
        update,
        values,
      });
    })
  );

export const versionedKeyValueStoreLayerFrom = ({
  apiRoot,
  container,
}: VersionedKeyValueStoreLayerOptions & {
  readonly apiRoot: ByProjectKeyRequestBuilder;
}) =>
  versionedKeyValueStoreImplementationLayer({ container }).pipe(
    Layer.provide(CommercetoolsRestClient.testLayer(apiRoot))
  );

export const versionedKeyValueStoreLayer = (
  options: VersionedKeyValueStoreLayerOptions
) =>
  versionedKeyValueStoreImplementationLayer(options).pipe(
    Layer.provide(commercetoolsClientsLayer)
  );
