import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import {
  StoreConflict,
  StoreError,
  StoreVersion,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Effect, Option, Schema } from "effect";
import { beforeEach, vi } from "vitest";

import { versionedKeyValueStoreLayerFrom } from "./versioned-store";

interface CustomObjectResponse {
  readonly body?: {
    readonly value: unknown;
    readonly version: number;
  };
}

interface CustomObjectQueryResponse {
  readonly body: {
    readonly results: readonly {
      readonly value: unknown;
      readonly version: number;
    }[];
  };
}

const getExecute = vi.fn<() => Promise<CustomObjectResponse>>();
const postExecute = vi.fn<() => Promise<CustomObjectResponse>>();
const removeExecute = vi.fn<() => Promise<CustomObjectResponse>>();
const queryExecute = vi.fn<() => Promise<CustomObjectQueryResponse>>();
const get = vi.fn<() => { execute: typeof getExecute }>(() => ({
  execute: getExecute,
}));
const post = vi.fn<() => { execute: typeof postExecute }>(() => ({
  execute: postExecute,
}));
const remove = vi.fn<() => { execute: typeof removeExecute }>(() => ({
  execute: removeExecute,
}));
const queryGet = vi.fn<() => { execute: typeof queryExecute }>(() => ({
  execute: queryExecute,
}));
const withContainer = vi.fn<() => { get: typeof queryGet }>(() => ({
  get: queryGet,
}));
const withContainerAndKey = vi.fn<
  () => { delete: typeof remove; get: typeof get }
>(() => ({ delete: remove, get }));
const customObjects = vi.fn<
  () => {
    post: typeof post;
    withContainer: typeof withContainer;
    withContainerAndKey: typeof withContainerAndKey;
  }
>(() => ({ post, withContainer, withContainerAndKey }));

class StoredItem extends Schema.Class<StoredItem>("StoredItem")({
  createdAt: Schema.Date,
  id: Schema.String,
}) {}

const container = "versioned-key-value-store";
const key = "item-1";
const item = new StoredItem({
  createdAt: new Date(0),
  id: key,
});
// SAFETY: Test double only implements the customObjects methods this suite calls.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- CT SDK request builder is not constructible in unit tests.
const apiRoot = { customObjects } as unknown as ByProjectKeyRequestBuilder;
const layer = versionedKeyValueStoreLayerFrom({ apiRoot, container });

const concurrentModificationError = Object.assign(
  new Error("Concurrent modification"),
  {
    code: "ConcurrentModification",
    statusCode: 409,
  }
);

describe("versionedKeyValueStoreLayer", () => {
  beforeEach(() => {
    getExecute.mockReset();
    postExecute.mockReset();
    removeExecute.mockReset();
    queryExecute.mockReset();
    get.mockClear();
    post.mockClear();
    remove.mockClear();
    queryGet.mockClear();
    withContainer.mockClear();
    withContainerAndKey.mockClear();
    customObjects.mockClear();
  });

  it.effect("returns none for missing custom objects", () =>
    Effect.gen(function* () {
      getExecute.mockRejectedValueOnce(
        Object.assign(new Error("Not found"), { statusCode: 404 })
      );
      const store = yield* VersionedKeyValueStore;

      const missing = yield* store.get(key, StoredItem);

      expect(Option.isNone(missing)).toBeTruthy();
      expect(withContainerAndKey).toHaveBeenCalledWith({ container, key });
    }).pipe(Effect.provide(layer))
  );

  it.effect("decodes custom object JSON values with provider versions", () =>
    Effect.gen(function* () {
      getExecute.mockResolvedValueOnce({
        body: {
          value: {
            createdAt: "1970-01-01T00:00:00.000Z",
            id: "item-1",
          },
          version: 7,
        },
      });
      const store = yield* VersionedKeyValueStore;

      const stored = yield* store
        .get(key, StoredItem)
        .pipe(Effect.flatMap(Effect.fromOption));

      expect(stored.value).toStrictEqual(item);
      expect(stored.version).toBe(StoreVersion.make("7"));
    }).pipe(Effect.provide(layer))
  );

  it.effect("uses version zero for create-only inserts", () =>
    Effect.gen(function* () {
      postExecute.mockResolvedValueOnce({});
      const store = yield* VersionedKeyValueStore;

      yield* store.insert(key, StoredItem, item);

      expect(customObjects).toHaveBeenCalledWith();
      expect(post).toHaveBeenCalledWith({
        body: {
          container,
          key,
          value: {
            createdAt: "1970-01-01T00:00:00.000Z",
            id: "item-1",
          },
          version: 0,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  it.effect("uses the loaded provider version for updates", () =>
    Effect.gen(function* () {
      postExecute.mockResolvedValueOnce({});
      const store = yield* VersionedKeyValueStore;

      yield* store.update(
        key,
        StoredItem,
        { value: item, version: StoreVersion.make("7") },
        new StoredItem({ createdAt: new Date(1), id: key })
      );

      expect(post).toHaveBeenCalledWith({
        body: {
          container,
          key,
          value: {
            createdAt: "1970-01-01T00:00:00.001Z",
            id: "item-1",
          },
          version: 7,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  it.effect("uses the loaded provider version for removals", () =>
    Effect.gen(function* () {
      removeExecute.mockResolvedValueOnce({});
      const store = yield* VersionedKeyValueStore;

      yield* store.remove(key, {
        value: item,
        version: StoreVersion.make("7"),
      });

      expect(remove).toHaveBeenCalledWith({ queryArgs: { version: 7 } });
    }).pipe(Effect.provide(layer))
  );

  it.effect("treats an already-missing removal as successful", () =>
    Effect.gen(function* () {
      removeExecute.mockRejectedValueOnce(
        Object.assign(new Error("Not found"), { statusCode: 404 })
      );
      const store = yield* VersionedKeyValueStore;

      yield* store.remove(key, {
        value: item,
        version: StoreVersion.make("7"),
      });

      expect(remove).toHaveBeenCalledWith({ queryArgs: { version: 7 } });
    }).pipe(Effect.provide(layer))
  );

  it.effect("maps concurrent removals to store conflicts", () =>
    Effect.gen(function* () {
      removeExecute.mockRejectedValueOnce(concurrentModificationError);
      const store = yield* VersionedKeyValueStore;

      const error = yield* store
        .remove(key, {
          value: item,
          version: StoreVersion.make("7"),
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(StoreConflict);
      expect(error.operation).toBe("remove");
    }).pipe(Effect.provide(layer))
  );

  it.effect("labels invalid removal versions as remove failures", () =>
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      const error = yield* store
        .remove(key, {
          value: item,
          version: StoreVersion.make("invalid"),
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(StoreError);
      expect(error.operation).toBe("remove");
      expect(removeExecute).not.toHaveBeenCalled();
    }).pipe(Effect.provide(layer))
  );

  it.effect("maps duplicate key inserts to store conflicts", () =>
    Effect.gen(function* () {
      postExecute.mockRejectedValueOnce(concurrentModificationError);
      const store = yield* VersionedKeyValueStore;

      const error = yield* store
        .insert(key, StoredItem, item)
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(StoreConflict);
      expect(error.operation).toBe("insert");
    }).pipe(Effect.provide(layer))
  );

  it.effect("maps concurrent updates to store conflicts", () =>
    Effect.gen(function* () {
      postExecute.mockRejectedValueOnce(concurrentModificationError);
      const store = yield* VersionedKeyValueStore;

      const error = yield* store
        .update(
          key,
          StoredItem,
          { value: item, version: StoreVersion.make("7") },
          item
        )
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(StoreConflict);
      expect(error.operation).toBe("update");
    }).pipe(Effect.provide(layer))
  );

  it.effect("maps string custom object values to store read errors", () =>
    Effect.gen(function* () {
      getExecute.mockResolvedValueOnce({
        body: {
          value: `{"id":"item-1","createdAt":"1970-01-01T00:00:00.000Z"}`,
          version: 7,
        },
      });
      const store = yield* VersionedKeyValueStore;

      const error = yield* store.get(key, StoredItem).pipe(Effect.flip);

      expect(error).toBeInstanceOf(StoreError);
      expect(error.operation).toBe("read");
    }).pipe(Effect.provide(layer))
  );

  it.effect("reads every page of custom object values", () =>
    Effect.gen(function* () {
      queryExecute
        .mockResolvedValueOnce({
          body: {
            results: Array.from({ length: 500 }, (_, index) => ({
              value: {
                createdAt: "1970-01-01T00:00:00.000Z",
                id: `item-${index}`,
              },
              version: 1,
            })),
          },
        })
        .mockResolvedValueOnce({
          body: {
            results: [
              {
                value: {
                  createdAt: "1970-01-01T00:00:00.000Z",
                  id: "item-500",
                },
                version: 2,
              },
            ],
          },
        });
      const store = yield* VersionedKeyValueStore;

      const values = yield* store.values(StoredItem);

      expect(values).toHaveLength(501);
      expect(values.at(-1)).toStrictEqual({
        value: new StoredItem({ createdAt: new Date(0), id: "item-500" }),
        version: StoreVersion.make("2"),
      });
      expect(queryGet).toHaveBeenNthCalledWith(1, {
        queryArgs: {
          limit: 500,
          offset: 0,
          sort: "key asc",
          withTotal: false,
        },
      });
      expect(queryGet).toHaveBeenNthCalledWith(2, {
        queryArgs: {
          limit: 500,
          offset: 500,
          sort: "key asc",
          withTotal: false,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  it.effect("maps unexpected provider failures to store errors", () =>
    Effect.gen(function* () {
      postExecute.mockRejectedValueOnce(new Error("provider unavailable"));
      const store = yield* VersionedKeyValueStore;

      const error = yield* store
        .insert(key, StoredItem, item)
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(StoreError);
      expect(error.operation).toBe("insert");
    }).pipe(Effect.provide(layer))
  );
});
