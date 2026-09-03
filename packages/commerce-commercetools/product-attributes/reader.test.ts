import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { productAttributesReader } from "./reader";

const attributesRaw = [
  { name: "capacity", value: 35 },
  { name: "iso45001", value: true },
  {
    name: "relatedProducts",
    value: [
      { id: "product-1", typeId: "product" },
      { id: "product-2", typeId: "product" },
    ],
  },
  { name: "mobility", value: { key: "tracked", label: "Tracked" } },
  { name: "model", value: 390 },
  { name: "futureAttribute", value: "ignored" },
] as const;

describe("Effect Product Attributes reader", () => {
  it.effect("normalizes and decodes generated Product Attributes", () =>
    Effect.gen(function* () {
      const attributes = yield* productAttributesReader.fromGraphql(
        "heavy-earthmoving-and-construction-equipment",
        attributesRaw,
        { locale: "en-US" }
      ).read;

      expect(attributes).toStrictEqual({
        capacity: 35,
        iso45001: true,
        mobility: { key: "tracked", label: "Tracked" },
        model: 390,
        relatedProducts: ["product-1", "product-2"],
      });
    })
  );

  it.effect("localizes values and supports fluent typed projections", () =>
    Effect.gen(function* () {
      const reader = productAttributesReader.fromGraphql(
        "heavy-lifting-and-specialized-equipment",
        [
          {
            name: "color",
            value: {
              key: "RED",
              label: { "de-DE": "Rot", "en-US": "Red" },
            },
          },
        ],
        { locale: "de-DE" }
      );
      const color = yield* reader.get("color");
      const selected = yield* reader
        .pick("color")
        .as("selectedColor")
        .pick("capacity")
        .toValues();

      expect(Option.getOrThrow(color)).toStrictEqual({
        key: "RED",
        label: "Rot",
      });
      expect(selected).toStrictEqual({
        selectedColor: { key: "RED", label: "Rot" },
      });
    })
  );

  it.effect(
    "uses configured locale priority when the requested locale is absent",
    () =>
      Effect.gen(function* () {
        const color = yield* productAttributesReader
          .fromGraphql(
            "heavy-lifting-and-specialized-equipment",
            [
              {
                name: "color",
                value: {
                  key: "RED",
                  label: { "de-DE": "Rot", "fr-FR": "Rouge" },
                },
              },
            ],
            { locale: "it-IT" }
          )
          .get("color");

        expect(Option.getOrThrow(color)).toStrictEqual({
          key: "RED",
          label: "Rouge",
        });
      })
  );

  it.effect("skips a blank requested translation", () =>
    Effect.gen(function* () {
      const color = yield* productAttributesReader
        .fromGraphql(
          "heavy-lifting-and-specialized-equipment",
          [
            {
              name: "color",
              value: {
                key: "RED",
                label: { "de-DE": "Rot", "en-US": "   " },
              },
            },
          ],
          { locale: "en-US" }
        )
        .get("color");

      expect(Option.getOrThrow(color)).toStrictEqual({
        key: "RED",
        label: "Rot",
      });
    })
  );

  it.effect("rejects an attribute without a usable translation", () =>
    Effect.gen(function* () {
      const result = yield* productAttributesReader
        .fromGraphql(
          "heavy-lifting-and-specialized-equipment",
          [
            {
              name: "color",
              value: {
                key: "RED",
                label: { "de-DE": "", "en-US": "   " },
              },
            },
          ],
          { locale: "en-US" }
        )
        .read.pipe(Effect.result);

      expect(result._tag).toBe("Failure");
    })
  );

  it.effect(
    "fails duplicate, malformed, and unknown enum Product Attributes",
    () =>
      Effect.gen(function* () {
        const duplicate = yield* productAttributesReader
          .fromGraphql(
            "heavy-earthmoving-and-construction-equipment",
            [
              { name: "model", value: 390 },
              { name: "model", value: 395 },
            ],
            { locale: "en-US" }
          )
          .read.pipe(Effect.result);
        const malformed = yield* productAttributesReader
          .fromGraphql(
            "heavy-earthmoving-and-construction-equipment",
            [{ name: "model", value: "390" }],
            { locale: "en-US" }
          )
          .read.pipe(Effect.result);
        const unknownEnum = yield* productAttributesReader
          .fromGraphql(
            "heavy-earthmoving-and-construction-equipment",
            [
              { name: "model", value: 390 },
              {
                name: "mobility",
                value: { key: "flying", label: "Flying" },
              },
            ],
            { locale: "en-US" }
          )
          .read.pipe(Effect.result);

        expect(duplicate._tag).toBe("Failure");
        expect(malformed._tag).toBe("Failure");
        expect(unknownEnum._tag).toBe("Failure");
      })
  );
});
