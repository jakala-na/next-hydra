import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";

import { define, reference } from "./definition";
import { customFieldsReader } from "./reader";

const DemoCustomFields = define({
  fields: {
    labels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    name: Schema.optionalKey(Schema.String),
    relatedProducts: Schema.optionalKey(
      Schema.ReadonlySet(reference("product"))
    ),
    state: Schema.optionalKey(Schema.Literals(["open", "closed"])),
  },
  typeKey: "demoCustomFields",
});

const graphqlCustomFields = {
  customFieldsRaw: [
    { name: "name", value: "Hydraulic pump" },
    {
      name: "state",
      value: { key: "open", label: "Open" },
    },
    {
      name: "labels",
      value: { "de-DE": "Pumpe", "en-US": "Pump" },
    },
    {
      name: "relatedProducts",
      value: [
        { id: "product-1", typeId: "product" },
        { id: "product-2", typeId: "product" },
      ],
    },
    { name: "futureField", value: "ignored" },
  ],
  type: { key: "demoCustomFields" },
};

describe("Effect Custom Fields reader", () => {
  it.effect("decodes generated fields without losing localized values", () =>
    Effect.gen(function* () {
      const reader = customFieldsReader.fromGraphql(
        DemoCustomFields,
        graphqlCustomFields
      );
      const values = yield* reader.read;

      expect(Option.getOrThrow(values)).toStrictEqual({
        labels: { "de-DE": "Pumpe", "en-US": "Pump" },
        name: "Hydraulic pump",
        relatedProducts: new Set([
          { id: "product-1", typeId: "product" },
          { id: "product-2", typeId: "product" },
        ]),
        state: "open",
      });
    })
  );

  it.effect(
    "returns Option.none only for an absent field or Custom container",
    () =>
      Effect.gen(function* () {
        const missingField = yield* customFieldsReader
          .fromGraphql(DemoCustomFields, graphqlCustomFields)
          .get("name");
        const missingDocument = yield* customFieldsReader
          .fromRest(DemoCustomFields, undefined)
          .get("name");

        expect(Option.getOrThrow(missingField)).toBe("Hydraulic pump");
        expect(Option.isNone(missingDocument)).toBeTruthy();
      })
  );

  it.effect("projects selected fields and aliases while omitting absence", () =>
    Effect.gen(function* () {
      const values = yield* customFieldsReader
        .fromGraphql(DemoCustomFields, graphqlCustomFields)
        .pick("name")
        .as("displayName")
        .pick("state")
        .pick("labels")
        .toValues();

      expect(values).toStrictEqual({
        displayName: "Hydraulic pump",
        labels: { "de-DE": "Pumpe", "en-US": "Pump" },
        state: "open",
      });
    })
  );

  it.effect("projects localized values with explicit fallback order", () =>
    Effect.gen(function* () {
      const reader = customFieldsReader.fromGraphql(
        DemoCustomFields,
        graphqlCustomFields
      );
      const requested = yield* reader.getLocalized("labels", "en-US");
      const configuredFallback = yield* reader.getLocalized(
        "labels",
        "fr-FR",
        "de-DE"
      );
      const storedFallback = yield* reader.getLocalized("labels", "fr-FR");

      expect({
        configuredFallback: Option.getOrThrow(configuredFallback),
        requested: Option.getOrThrow(requested),
        storedFallback: Option.getOrThrow(storedFallback),
      }).toStrictEqual({
        configuredFallback: "Pumpe",
        requested: "Pump",
        storedFallback: "Pumpe",
      });
    })
  );

  it.effect("skips blank localized values and reports no usable value", () =>
    Effect.gen(function* () {
      const withUsableFallback = customFieldsReader.fromGraphql(
        DemoCustomFields,
        {
          customFieldsRaw: [
            {
              name: "labels",
              value: {
                "de-DE": "Pumpe",
                "en-US": "   ",
                "fr-FR": "",
              },
            },
          ],
          type: { key: "demoCustomFields" },
        }
      );
      const withoutUsableValue = customFieldsReader.fromGraphql(
        DemoCustomFields,
        {
          customFieldsRaw: [
            {
              name: "labels",
              value: { "de-DE": "", "en-US": "   " },
            },
          ],
          type: { key: "demoCustomFields" },
        }
      );

      const fallback = yield* withUsableFallback.getLocalized(
        "labels",
        "en-US",
        "fr-FR"
      );
      const missing = yield* withoutUsableValue.getLocalized("labels", "en-US");

      expect(Option.getOrThrow(fallback)).toBe("Pumpe");
      expect(Option.isNone(missing)).toBeTruthy();
    })
  );

  it.effect("gives resolvers the expanded provider resource", () =>
    Effect.gen(function* () {
      const value = yield* customFieldsReader
        .fromGraphql(DemoCustomFields, {
          customFieldsRaw: [
            {
              name: "name",
              referencedResource: { key: "expanded-object" },
              value: "Hydraulic pump",
            },
          ],
          type: { key: "demoCustomFields" },
        })
        .get("name", {
          resolve: ({ referencedResource, value: fieldValue }) =>
            Effect.gen(function* () {
              const resource = yield* Schema.decodeUnknownEffect(
                Schema.Struct({ key: Schema.String })
              )(referencedResource);
              return { ...resource, value: fieldValue };
            }),
        });

      expect(Option.getOrThrow(value)).toStrictEqual({
        key: "expanded-object",
        value: "Hydraulic pump",
      });
    })
  );

  it.effect("composes resolved values into typed projections", () =>
    Effect.gen(function* () {
      const values = yield* customFieldsReader
        .fromGraphql(DemoCustomFields, {
          customFieldsRaw: [
            {
              name: "name",
              referencedResource: { key: "expanded-object" },
              value: "Hydraulic pump",
            },
            { name: "state", value: { key: "open", label: "Open" } },
          ],
          type: { key: "demoCustomFields" },
        })
        .pick("name", {
          resolve: ({ referencedResource, value }) =>
            Schema.decodeUnknownEffect(Schema.Struct({ key: Schema.String }))(
              referencedResource
            ).pipe(Effect.map((resource) => ({ ...resource, value }))),
        })
        .as("resolvedName")
        .pick("state")
        .toValues();

      expect(values).toStrictEqual({
        resolvedName: {
          key: "expanded-object",
          value: "Hydraulic pump",
        },
        state: "open",
      });
    })
  );

  it.effect(
    "fails malformed known fields instead of treating them as absent",
    () =>
      Effect.gen(function* () {
        const result = yield* customFieldsReader
          .fromRest(DemoCustomFields, {
            fields: { name: 42 },
            type: { key: "demoCustomFields" },
          })
          .get("name")
          .pipe(Effect.result);

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure._tag).toBe("SchemaError");
        }
      })
  );

  it.effect("fails a different Custom Type and duplicate GraphQL fields", () =>
    Effect.gen(function* () {
      const wrongType = yield* customFieldsReader
        .fromGraphql(DemoCustomFields, {
          customFieldsRaw: [],
          type: { key: "otherCustomFields" },
        })
        .read.pipe(Effect.result);
      const duplicate = yield* customFieldsReader
        .fromGraphql(DemoCustomFields, {
          customFieldsRaw: [
            { name: "name", value: "first" },
            { name: "name", value: "second" },
          ],
          type: { key: "demoCustomFields" },
        })
        .read.pipe(Effect.result);

      expect(wrongType._tag).toBe("Failure");
      expect(duplicate._tag).toBe("Failure");
    })
  );

  it.effect("requires REST Custom Type identity to be available", () =>
    Effect.gen(function* () {
      const unexpanded = yield* customFieldsReader
        .fromRest(DemoCustomFields, {
          fields: { name: "Hydraulic pump" },
          type: { id: "type-from-provider", typeId: "type" },
        })
        .read.pipe(Effect.result);
      const expanded = yield* customFieldsReader.fromRest(DemoCustomFields, {
        fields: { name: "Hydraulic pump" },
        type: {
          id: "type-from-provider",
          obj: { key: "demoCustomFields" },
          typeId: "type",
        },
      }).read;

      expect(unexpanded._tag).toBe("Failure");
      expect(Option.getOrThrow(expanded).name).toBe("Hydraulic pump");
    })
  );
});
