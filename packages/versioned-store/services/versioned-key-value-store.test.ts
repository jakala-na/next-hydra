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
} from "./versioned-key-value-store";

const RedactedEmail = Schema.String.pipe(
  Schema.decodeTo(Schema.Redacted(Schema.String, { label: "email" }), {
    decode: SchemaGetter.transform((email: string) =>
      Redacted.make(email, { label: "email" })
    ),
    encode: SchemaGetter.transform((email: Redacted.Redacted<string>) =>
      Redacted.value(email)
    ),
  })
);

class ExampleRecord extends Schema.Class<ExampleRecord>("ExampleRecord")({
  id: Schema.String,
  email: RedactedEmail,
  createdAt: Schema.Date,
}) {}

const key = "example-1";
const example = new ExampleRecord({
  id: key,
  email: Redacted.make("ada@example.com", { label: "email" }),
  createdAt: new Date(0),
});

const updatedExample = new ExampleRecord({
  id: key,
  email: Redacted.make("grace@example.com", { label: "email" }),
  createdAt: new Date(1),
});

describe("VersionedKeyValueStore.layerMemory", () => {
  it("keeps redacted fields redacted during formatted JSON logging", async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const storageJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.toCodecJson(ExampleRecord))
        )(example);
        const logJson = Formatter.formatJson(example);

        expect(storageJson).toContain("ada@example.com");
        expect(logJson).not.toContain("ada@example.com");
        expect(logJson).toContain("<redacted:email>");
      })
    ));

  it("returns none for missing keys", async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        const missing = yield* store.get(key, ExampleRecord);

        expect(Option.isNone(missing)).toBe(true);
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    ));

  it("inserts and decodes schema values by key", async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const stored = yield* store.get(key, ExampleRecord);

        expect(Option.isSome(stored)).toBe(true);
        if (Option.isSome(stored)) {
          expect(stored.value.value.id).toBe(example.id);
          expect(stored.value.value.createdAt).toBeInstanceOf(Date);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    ));

  it("rejects duplicate create-only inserts", async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        yield* store.insert(key, ExampleRecord, example);
        const exit = yield* store
          .insert(key, ExampleRecord, example)
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(StoreConflict.name);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    ));

  it("updates with the current version and returns a new version", async () =>
    Effect.runPromise(
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
    ));

  it("rejects stale versioned updates", async () =>
    Effect.runPromise(
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

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(StoreConflict.name);
        }
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    ));
});
