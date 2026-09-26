import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { customFieldsBuilder } from "./builder";
import { define } from "./definition";

const DemoCustomFields = define({
  fields: {
    count: Schema.optionalKey(Schema.Int),
    name: Schema.optionalKey(Schema.String),
  },
  typeKey: "demoCustomFields",
});

const RequiredCustomFields = define({
  fields: {
    requiredName: Schema.String,
  },
  typeKey: "requiredCustomFields",
});

const Payload = Schema.Struct({ value: Schema.String });
const JsonStringCustomFields = define({
  fields: {
    payload: Schema.optionalKey(Schema.fromJsonString(Payload)),
  },
  typeKey: "jsonStringCustomFields",
});

describe("Effect Custom Fields builder", () => {
  it.effect("creates a typed draft for REST and GraphQL", () =>
    Effect.gen(function* () {
      const builder = customFieldsBuilder
        .forType(DemoCustomFields)
        .set("name", "Hydraulic pump")
        .set("count", 2);
      const restDraft = yield* builder.toRestDraft();
      const graphqlDraft = yield* builder.toGraphqlDraft();

      expect(restDraft).toStrictEqual({
        fields: { count: 2, name: "Hydraulic pump" },
        type: { key: "demoCustomFields", typeId: "type" },
      });
      expect(graphqlDraft).toStrictEqual({
        fields: [
          { name: "name", value: '"Hydraulic pump"' },
          { name: "count", value: "2" },
        ],
        typeKey: "demoCustomFields",
      });
    })
  );

  it.effect("assigns an absent type and patches only changed fields", () =>
    Effect.gen(function* () {
      const builder = customFieldsBuilder
        .forType(DemoCustomFields)
        .set("name", "Updated")
        .unset("count");
      const absent = yield* builder.againstRest(undefined).plan;
      const existingActions = yield* builder
        .againstRest({
          fields: { count: 2, name: "Original" },
          type: { key: "demoCustomFields" },
        })
        .toRestUpdateActions();

      expect(absent).toStrictEqual({
        _tag: "SetType",
        fields: { name: "Updated" },
        typeKey: "demoCustomFields",
      });
      expect(existingActions).toStrictEqual([
        { action: "setCustomField", name: "name", value: "Updated" },
        { action: "setCustomField", name: "count", value: null },
      ]);
    })
  );

  it.effect(
    "suppresses no-op writes and makes ensureType non-destructive",
    () =>
      Effect.gen(function* () {
        const matching = {
          customFieldsRaw: [{ name: "name", value: "Hydraulic pump" }],
          type: { key: "demoCustomFields" },
        };
        const unchanged = yield* customFieldsBuilder
          .forType(DemoCustomFields)
          .set("name", "Hydraulic pump")
          .againstGraphql(matching).plan;
        const ensuredExisting = yield* customFieldsBuilder
          .forType(DemoCustomFields)
          .ensureType()
          .againstGraphql(matching).plan;
        const ensuredAbsent = yield* customFieldsBuilder
          .forType(DemoCustomFields)
          .ensureType()
          .againstGraphql(null).plan;

        expect(unchanged).toStrictEqual({ _tag: "NoChange" });
        expect(ensuredExisting).toStrictEqual({ _tag: "NoChange" });
        expect(ensuredAbsent).toStrictEqual({
          _tag: "SetType",
          fields: {},
          typeKey: "demoCustomFields",
        });
      })
  );

  it.effect(
    "keeps builders immutable with deterministic last-intent-wins",
    () =>
      Effect.gen(function* () {
        const base = customFieldsBuilder
          .forType(DemoCustomFields)
          .set("name", "first");
        const changed = base.unset("name").set("name", "last");
        const baseDraft = yield* base.toDraft();
        const changedDraft = yield* changed.toDraft();

        expect(baseDraft.fields).toStrictEqual({ name: "first" });
        expect(changedDraft.fields).toStrictEqual({ name: "last" });
      })
  );

  it.effect(
    "fails a missing required field and an incompatible current type",
    () =>
      Effect.gen(function* () {
        const missingRequired = yield* customFieldsBuilder
          .forType(RequiredCustomFields)
          .toDraft()
          .pipe(Effect.result);
        const wrongType = yield* customFieldsBuilder
          .forType(DemoCustomFields)
          .set("name", "Updated")
          .againstRest({
            fields: {},
            type: { key: "otherCustomFields" },
          })
          .plan.pipe(Effect.result);
        const unknownRestType = yield* customFieldsBuilder
          .forType(DemoCustomFields)
          .set("name", "Updated")
          .againstRest({
            fields: {},
            type: { id: "type-from-provider", typeId: "type" },
          })
          .plan.pipe(Effect.result);

        expect(missingRequired._tag).toBe("Failure");
        expect(wrongType._tag).toBe("Failure");
        expect(unknownRestType._tag).toBe("Failure");
      })
  );

  it.effect("renders REST updates from GraphQL current state", () =>
    Effect.gen(function* () {
      const actions = yield* customFieldsBuilder
        .forType(DemoCustomFields)
        .set("name", "Updated")
        .againstGraphql({
          customFieldsRaw: [{ name: "name", value: "Original" }],
          type: { key: "demoCustomFields" },
        })
        .toRestUpdateActions();

      expect(actions).toStrictEqual([
        { action: "setCustomField", name: "name", value: "Updated" },
      ]);
    })
  );

  it.effect(
    "keeps stored String JSON separate from GraphQL envelope encoding",
    () =>
      Effect.gen(function* () {
        const builder = customFieldsBuilder
          .forType(JsonStringCustomFields)
          .set("payload", { value: "persisted" });
        const draft = yield* builder.toDraft();
        const actions = yield* builder
          .againstGraphql(null)
          .toGraphqlUpdateActions();

        expect(draft.fields).toStrictEqual({
          payload: '{"value":"persisted"}',
        });
        expect(actions).toStrictEqual([
          {
            setCustomType: {
              fields: [
                {
                  name: "payload",
                  value: '"{\\"value\\":\\"persisted\\"}"',
                },
              ],
              typeKey: "jsonStringCustomFields",
            },
          },
        ]);
      })
  );
});
