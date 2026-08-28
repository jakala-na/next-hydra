import {
  Effect,
  Exit,
  Formatter,
  Option,
  Redacted,
  Schema,
  SchemaGetter,
} from "effect";
import { describe, expect, it } from "vitest";

import {
  StoreConflict,
  VersionedKeyValueStore,
  VersionedStoreKey,
} from "./versioned-key-value-store";

const RedactedEmail = Schema.String.pipe(
  Schema.decodeTo(Schema.Redacted(Schema.String, { label: "email" }), {
    decode: SchemaGetter.transform((email: string) =>
      Redacted.make(email, { label: "email" })
    ),
    encode: SchemaGetter.transform((email: Redacted.Redacted) =>
      Redacted.value(email)
    ),
  })
);

class ExampleRecord extends Schema.Class<ExampleRecord>("ExampleRecord")({
  createdAt: Schema.Date,
  email: RedactedEmail,
  id: Schema.String,
}) {}

const key = VersionedStoreKey.make("example-1");
const example = new ExampleRecord({
  createdAt: new Date(0),
  email: Redacted.make("ada@example.com", { label: "email" }),
  id: key,
});

const updatedExample = new ExampleRecord({
  createdAt: new Date(1),
  email: Redacted.make("grace@example.com", { label: "email" }),
  id: key,
});

describe("VersionedKeyValueStore.layerMemory", () => {
  it("keeps redacted fields redacted during formatted JSON logging", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const storageJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.toCodecJson(ExampleRecord))
        )(example);
        const logJson = Formatter.formatJson(example);

        expect(storageJson).toContain("ada@example.com");
        expect(logJson).not.toContain("ada@example.com");
        expect(logJson).toContain("<redacted:email>");
      })
    );
  });

  it("returns none for missing keys", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        const missing = yield* store.get(key, ExampleRecord);

        expect(Option.isNone(missing)).toBeTruthy();
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });

  it("inserts and decodes schema values by key", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const stored = yield* store.get(key, ExampleRecord);

        expect(Option.isSome(stored)).toBeTruthy();
        if (Option.isSome(stored)) {
          expect(stored.value.value.id).toBe(example.id);
          expect(stored.value.value.createdAt).toBeInstanceOf(Date);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });

  it("rejects duplicate create-only inserts", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const exit = yield* store
          .insert(key, ExampleRecord, example)
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(StoreConflict.name);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });

  it("updates with the current version and returns a new version", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const current = yield* store
          .get(key, ExampleRecord)
          .pipe(Effect.flatMap(Effect.fromOption));

        yield* store.update(key, ExampleRecord, current, updatedExample);
        const updated = yield* store
          .get(key, ExampleRecord)
          .pipe(Effect.flatMap(Effect.fromOption));

        expect(updated.value.email).toStrictEqual(updatedExample.email);
        expect(updated.version).not.toBe(current.version);
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });

  it("rejects stale versioned updates", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const stale = yield* store
          .get(key, ExampleRecord)
          .pipe(Effect.flatMap(Effect.fromOption));
        yield* store.update(key, ExampleRecord, stale, updatedExample);

        const exit = yield* store
          .update(key, ExampleRecord, stale, example)
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(StoreConflict.name);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });

  it("removes only the current version and is idempotent once absent", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const current = yield* store
          .get(key, ExampleRecord)
          .pipe(Effect.flatMap(Effect.fromOption));

        yield* store.remove(key, current);
        yield* store.remove(key, current);

        expect(
          Option.isNone(yield* store.get(key, ExampleRecord))
        ).toBeTruthy();
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });

  it("rejects removal with a stale version", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const stale = yield* store
          .get(key, ExampleRecord)
          .pipe(Effect.flatMap(Effect.fromOption));
        yield* store.update(key, ExampleRecord, stale, updatedExample);

        const exit = yield* store.remove(key, stale).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(StoreConflict.name);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
  });
});
