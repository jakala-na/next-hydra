import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";

import {
  CategoryId,
  ListProductCardsInput,
  ProductCard,
  ProductDiscovery,
  ProductDiscoveryFailure,
  ProductId,
  ProductSlug,
} from "./index";

const COLLECTION_LIMIT = 3;

describe(ProductDiscovery, () => {
  it.effect("represents a missing Product as normal absence", () =>
    Effect.gen(function* () {
      const productDiscovery = yield* ProductDiscovery;
      const product = yield* productDiscovery.findBySlug(
        ProductSlug.make("missing-product")
      );

      expect(Option.isNone(product)).toBeTruthy();
    }).pipe(Effect.provide(ProductDiscovery.testLayer()))
  );

  it.effect("represents an empty Product collection as a successful read", () =>
    Effect.gen(function* () {
      const productDiscovery = yield* ProductDiscovery;
      const products = yield* productDiscovery.listCards(
        new ListProductCardsInput({
          limit: COLLECTION_LIMIT,
        })
      );

      expect(products).toStrictEqual([]);
    }).pipe(Effect.provide(ProductDiscovery.testLayer()))
  );

  it.effect("supplies domain inputs and deterministic cards to callers", () => {
    const card = Schema.decodeUnknownSync(ProductCard)({
      availableForSale: true,
      id: "product-1",
      slug: "crawler-crane",
      title: "Crawler crane",
    });
    const input = new ListProductCardsInput({
      categoryId: CategoryId.make("category-1"),
      excludeProductId: ProductId.make("product-2"),
      limit: COLLECTION_LIMIT,
    });
    let receivedInput: ListProductCardsInput | undefined;

    return Effect.gen(function* () {
      const productDiscovery = yield* ProductDiscovery;
      const products = yield* productDiscovery.listCards(input);

      expect(receivedInput).toBe(input);
      expect(products).toStrictEqual([card]);
    }).pipe(
      Effect.provide(
        ProductDiscovery.testLayer({
          listCards: (received) => {
            receivedInput = received;
            return Effect.succeed([card]);
          },
        })
      )
    );
  });

  it.effect("preserves the failed Product Discovery operation", () => {
    const failure = new ProductDiscoveryFailure({
      cause: new Error("provider unavailable"),
      message: "Product collection query failed",
      operation: "listCards",
    });

    return Effect.gen(function* () {
      const productDiscovery = yield* ProductDiscovery;
      const error = yield* productDiscovery
        .listCards(
          new ListProductCardsInput({
            limit: COLLECTION_LIMIT,
          })
        )
        .pipe(Effect.flip);

      expect(error).toBe(failure);
      expect(error).toMatchObject({
        _tag: "ProductDiscoveryFailure",
        message: "Product collection query failed",
        operation: "listCards",
      });
    }).pipe(
      Effect.provide(
        ProductDiscovery.testLayer({
          listCards: () => Effect.fail(failure),
        })
      )
    );
  });
});

describe(ListProductCardsInput, () => {
  it("decodes only positive integer limits", () => {
    const input = Schema.decodeUnknownSync(ListProductCardsInput)({
      categoryId: "category-1",
      excludeProductId: "product-2",
      limit: COLLECTION_LIMIT,
    });

    expect(input).toEqual({
      categoryId: "category-1",
      excludeProductId: "product-2",
      limit: COLLECTION_LIMIT,
    });
    expect(() =>
      Schema.decodeUnknownSync(ListProductCardsInput)({ limit: 0 })
    ).toThrow("greater than 0");
    expect(() =>
      Schema.decodeUnknownSync(ListProductCardsInput)({ limit: 1.5 })
    ).toThrow("an integer");
  });
});
