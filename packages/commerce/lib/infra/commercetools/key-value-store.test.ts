import { describe, expect, it } from "@effect/vitest";
import {
  StoreConflict,
  StoreError,
  StoreVersion,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Effect, Option, Schema } from "effect";
import { beforeEach, vi } from "vitest";
import { layerCommercetoolsCustomObjectKeyValueStore } from "./key-value-store";

const mocks = vi.hoisted(() => {
  const getExecuteMock = vi.fn();
  const postExecuteMock = vi.fn();
  const getMock = vi.fn(() => ({ execute: getExecuteMock }));
  const postMock = vi.fn(() => ({ execute: postExecuteMock }));
  const withContainerAndKeyMock = vi.fn(() => ({ get: getMock }));
  const customObjectsMock = vi.fn(() => ({
    post: postMock,
    withContainerAndKey: withContainerAndKeyMock,
  }));
  const lockCustomObjectsMock = vi.fn(() => ({
    post: postMock,
  }));

  return {
    customObjects: customObjectsMock,
    get: getMock,
    getExecute: getExecuteMock,
    lockCustomObjects: lockCustomObjectsMock,
    post: postMock,
    postExecute: postExecuteMock,
    withContainerAndKey: withContainerAndKeyMock,
  };
});

vi.mock("../../client/api-root", () => ({
  apiRoot: {
    customObjects: mocks.customObjects,
  },
  apiRootWithoutConcurrentModificationRetry: {
    customObjects: mocks.lockCustomObjects,
  },
}));

const {
  customObjects,
  get,
  getExecute,
  lockCustomObjects,
  post,
  postExecute,
  withContainerAndKey,
} = mocks;

class StoredItem extends Schema.Class<StoredItem>("StoredItem")({
  id: Schema.String,
  createdAt: Schema.Date,
}) {}

const container = "versioned-key-value-store";
const key = "item-1";
const item = new StoredItem({
  id: key,
  createdAt: new Date(0),
});
const layer = layerCommercetoolsCustomObjectKeyValueStore({ container });

const concurrentModificationError = Object.assign(
  new Error("Concurrent modification"),
  {
    code: "ConcurrentModification",
    statusCode: 409,
  }
);

beforeEach(() => {
  getExecute.mockReset();
  postExecute.mockReset();
  get.mockClear();
  post.mockClear();
  withContainerAndKey.mockClear();
  customObjects.mockClear();
  lockCustomObjects.mockClear();
});

describe("layerCommercetoolsCustomObjectKeyValueStore", () => {
  it.effect("returns none for missing custom objects", () =>
    Effect.gen(function* () {
      getExecute.mockRejectedValueOnce(
        Object.assign(new Error("Not found"), { statusCode: 404 })
      );
      const store = yield* VersionedKeyValueStore;

      const missing = yield* store.get(key, StoredItem);

      expect(Option.isNone(missing)).toBe(true);
      expect(withContainerAndKey).toHaveBeenCalledWith({ container, key });
    }).pipe(Effect.provide(layer))
  );

  it.effect("decodes custom object JSON values with provider versions", () =>
    Effect.gen(function* () {
      getExecute.mockResolvedValueOnce({
        body: {
          value: {
            id: "item-1",
            createdAt: "1970-01-01T00:00:00.000Z",
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

      expect(lockCustomObjects).toHaveBeenCalled();
      expect(post).toHaveBeenCalledWith({
        body: {
          container,
          key,
          version: 0,
          value: {
            id: "item-1",
            createdAt: "1970-01-01T00:00:00.000Z",
          },
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
        new StoredItem({ id: key, createdAt: new Date(1) })
      );

      expect(post).toHaveBeenCalledWith({
        body: {
          container,
          key,
          version: 7,
          value: {
            id: "item-1",
            createdAt: "1970-01-01T00:00:00.001Z",
          },
        },
      });
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
