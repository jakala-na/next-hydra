import { describe, expect, it } from "@effect/vitest";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import {
  AnonymousCommercePrincipal,
  AuthUserId,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import {
  CategoryId,
  ListProductCardsInput,
  ProductDiscovery,
  ProductId,
  ProductSlug,
} from "@repo/commerce/product";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import { Effect, Layer, Option } from "effect";

import {
  CommercetoolsProductDiscoveryClient,
  CommercetoolsProductRequestFailure,
} from "./client";
import type {
  CommercetoolsProductProjection,
  CommercetoolsProductSelectionRule,
  CommercetoolsProductVariant,
  ListCommercetoolsProductProjectionsInput,
  CommercetoolsProductDiscoveryClient as ProductClient,
  ResolveCommercetoolsProductContextInput,
} from "./client";
import { productDiscoveryLayerWithClient } from "./product-discovery";

const store = resolveStore({ locale: CommerceLocale.make("en-US") });
const productId = ProductId.make("product-1");

const commerceContextLayer = (authenticated = false) =>
  Layer.succeed(
    CommerceContext,
    CommerceContext.of({
      customerPrincipal: () => Effect.die("not used"),
      customerProfile: () => Effect.die("not used"),
      principal: authenticated
        ? new CustomerCommercePrincipal({
            authUserId: AuthUserId.make("auth-user-1"),
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make(
              "business-unit-key-1"
            ),
            customerId: CommerceCustomerId.make("customer-1"),
            roles: ["admin", "buyer"],
          })
        : new AnonymousCommercePrincipal({}),
      store,
    })
  );

const context = {
  distributionChannelId: "distribution-channel-1",
  supplyChannelIds: ["supply-channel-1", "supply-channel-2"],
} as const;

const variant = (
  overrides: Partial<CommercetoolsProductVariant> = {}
): CommercetoolsProductVariant => ({
  attributesRaw: [
    { name: "model", value: 100 },
    {
      name: "mobility",
      value: { key: "tracked", label: "Tracked" },
    },
    {
      name: "relatedProducts",
      value: [{ id: "related-product-1", typeId: "product" }],
    },
  ],
  availability: {
    channels: [{ availableQuantity: 2 }, { availableQuantity: 3 }],
  },
  id: 1,
  images: [
    {
      label: "Product one",
      url: "https://images.example.com/product-1.jpg",
    },
  ],
  price: {
    discounted: {
      value: { centAmount: 9000, currencyCode: "USD" },
    },
    value: { centAmount: 10_000, currencyCode: "USD" },
  },
  sku: "sku-1",
  ...overrides,
});

const projection = (
  overrides: Partial<CommercetoolsProductProjection> = {}
): CommercetoolsProductProjection => ({
  allVariants: [variant()],
  categories: [
    {
      id: "category-1",
      name: "Cranes",
      slug: "cranes",
    },
  ],
  description: "Heavy lifting equipment",
  id: productId,
  masterVariant: {
    images: [
      {
        label: "Product one",
        url: "https://images.example.com/product-1.jpg",
      },
    ],
  },
  name: "Crawler crane",
  productType: {
    key: "heavy-earthmoving-and-construction-equipment",
  },
  slug: "crawler-crane",
  ...overrides,
});

const includeAll: readonly CommercetoolsProductSelectionRule[] = [
  {
    mode: "Individual",
    variantExclusion: null,
    variantSelection: null,
  },
];

const makeClientLayer = (
  handlers: Parameters<typeof CommercetoolsProductDiscoveryClient.testLayer>[0]
) =>
  CommercetoolsProductDiscoveryClient.testLayer({
    getProductSelectionRules: (_storeKey, productIds) =>
      Effect.succeed(
        new Map(productIds.map((id) => [id, includeAll] as const))
      ),
    resolveProductContext: () => Effect.succeed(context),
    ...handlers,
  });

const runWithClient = <A, E>(
  program: Effect.Effect<A, E, ProductDiscovery>,
  clientLayer: Layer.Layer<ProductClient>,
  authenticated = false
) =>
  program.pipe(
    Effect.provide(
      productDiscoveryLayerWithClient(clientLayer).pipe(
        Layer.provide(commerceContextLayer(authenticated))
      )
    )
  );

const findProductBySlug = (slug: ProductSlug) =>
  ProductDiscovery.pipe(Effect.flatMap((service) => service.findBySlug(slug)));

const listProductCards = (input: ListProductCardsInput) =>
  ProductDiscovery.pipe(Effect.flatMap((service) => service.listCards(input)));

describe("Commercetools Product Discovery", () => {
  it.effect(
    "resolves provider Store details from CommerceContext without exposing them to the caller",
    () =>
      Effect.gen(function* () {
        let receivedContext:
          | ResolveCommercetoolsProductContextInput
          | undefined;
        const clientLayer = makeClientLayer({
          findProductBySlug: () => Effect.succeed(null),
          resolveProductContext: (input) => {
            receivedContext = input;
            return Effect.succeed(context);
          },
        });

        const result = yield* runWithClient(
          findProductBySlug(ProductSlug.make("missing-product")),
          clientLayer
        );

        expect(Option.isNone(result)).toBeTruthy();
        expect(receivedContext).toStrictEqual({
          customerId: undefined,
          locale: "en-US",
          storeKey: "default-store",
        });
      })
  );

  it.effect(
    "passes authenticated buyer identity into private price-context resolution",
    () =>
      Effect.gen(function* () {
        let receivedContext:
          | ResolveCommercetoolsProductContextInput
          | undefined;
        let receivedBuyerSegment: string | undefined;
        const clientLayer = makeClientLayer({
          findProductBySlug: (input) => {
            receivedBuyerSegment = input.context.customerGroupId;
            return Effect.succeed(null);
          },
          resolveProductContext: (input) => {
            receivedContext = input;
            return Effect.succeed({ ...context, customerGroupId: "segment-1" });
          },
        });

        yield* runWithClient(
          findProductBySlug(ProductSlug.make("missing-product")),
          clientLayer,
          true
        );

        expect(receivedContext?.customerId).toBe("customer-1");
        expect(receivedBuyerSegment).toBe("segment-1");
      })
  );

  it.effect("maps eligible variants into a typed Product Detail", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        findProductBySlug: () => Effect.succeed(projection()),
      });

      const result = yield* runWithClient(
        findProductBySlug(ProductSlug.make("crawler-crane")),
        clientLayer
      );

      expect(Option.getOrThrow(result)).toMatchObject({
        defaultVariantId: "1",
        id: "product-1",
        options: [
          {
            key: "model",
            label: "Model",
            values: [{ key: "100", label: "100" }],
          },
        ],
        productType: "heavy-earthmoving-and-construction-equipment",
        slug: "crawler-crane",
        title: "Crawler crane",
        variants: [
          {
            attributes: {
              mobility: { key: "tracked", label: "Tracked" },
              model: 100,
              relatedProducts: ["related-product-1"],
            },
            availability: {
              availableForSale: true,
              availableQuantity: 5,
            },
            id: "1",
            optionValues: { model: "100" },
            price: {
              discounted: { centAmount: 9000, currencyCode: "USD" },
              regular: { centAmount: 10_000, currencyCode: "USD" },
            },
            sku: "sku-1",
          },
        ],
      });
    })
  );

  it.effect(
    "uses the first eligible variant as the default after Product Selection filtering",
    () =>
      Effect.gen(function* () {
        const clientLayer = makeClientLayer({
          findProductBySlug: () =>
            Effect.succeed(
              projection({
                allVariants: [
                  variant({
                    attributesRaw: [{ name: "model", value: 100 }],
                    id: 1,
                    sku: "excluded",
                  }),
                  variant({
                    attributesRaw: [{ name: "model", value: 200 }],
                    id: 2,
                    sku: "eligible",
                  }),
                ],
              })
            ),
          getProductSelectionRules: () =>
            Effect.succeed(
              new Map([
                [
                  productId,
                  [
                    {
                      mode: "Individual" as const,
                      variantExclusion: null,
                      variantSelection: {
                        skus: ["eligible"],
                        type: "includeOnly" as const,
                      },
                    },
                  ],
                ],
              ])
            ),
        });

        const result = yield* runWithClient(
          findProductBySlug(ProductSlug.make("crawler-crane")),
          clientLayer
        );
        const detail = Option.getOrThrow(result);

        expect(detail.defaultVariantId).toBe("2");
        expect(detail.variants.map(({ id }) => id)).toStrictEqual(["2"]);
      })
  );

  it.effect("removes variants excluded by the Store's Product Selection", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        findProductBySlug: () =>
          Effect.succeed(
            projection({
              allVariants: [
                variant({ id: 1, sku: "eligible" }),
                variant({ id: 2, sku: "excluded" }),
              ],
            })
          ),
        getProductSelectionRules: () =>
          Effect.succeed(
            new Map([
              [
                productId,
                [
                  {
                    mode: "IndividualExclusion" as const,
                    variantExclusion: { skus: ["excluded"] },
                    variantSelection: null,
                  },
                ],
              ],
            ])
          ),
      });

      const result = yield* runWithClient(
        findProductBySlug(ProductSlug.make("crawler-crane")),
        clientLayer
      );

      expect(
        Option.getOrThrow(result).variants.map(({ sku }) => sku)
      ).toStrictEqual(["eligible"]);
    })
  );

  it.effect("treats a Product with no Store assignment as absent", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        findProductBySlug: () => Effect.succeed(projection()),
        getProductSelectionRules: () => Effect.succeed(new Map()),
      });

      const result = yield* runWithClient(
        findProductBySlug(ProductSlug.make("crawler-crane")),
        clientLayer
      );

      expect(Option.isNone(result)).toBeTruthy();
    })
  );

  it.effect("keeps quote-only variants valid", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        findProductBySlug: () =>
          Effect.succeed(
            projection({ allVariants: [variant({ price: null })] })
          ),
      });

      const result = yield* runWithClient(
        findProductBySlug(ProductSlug.make("crawler-crane")),
        clientLayer
      );

      expect(Option.getOrThrow(result).variants[0]).not.toHaveProperty("price");
    })
  );

  it.effect(
    "keeps a selected regular price without fabricating a discount",
    () =>
      Effect.gen(function* () {
        const clientLayer = makeClientLayer({
          findProductBySlug: () =>
            Effect.succeed(
              projection({
                allVariants: [
                  variant({
                    price: {
                      discounted: null,
                      value: { centAmount: 10_000, currencyCode: "USD" },
                    },
                  }),
                ],
              })
            ),
        });

        const result = yield* runWithClient(
          findProductBySlug(ProductSlug.make("crawler-crane")),
          clientLayer
        );

        expect(Option.getOrThrow(result).variants[0]?.price).toStrictEqual({
          regular: { centAmount: 10_000, currencyCode: "USD" },
        });
      })
  );

  it.effect(
    "uses a stored Product Attribute translation when the locale is absent",
    () =>
      Effect.gen(function* () {
        const clientLayer = makeClientLayer({
          findProductBySlug: () =>
            Effect.succeed(
              projection({
                allVariants: [
                  variant({
                    attributesRaw: [
                      {
                        name: "color",
                        value: {
                          key: "RED",
                          label: { "de-DE": "Rot" },
                        },
                      },
                    ],
                  }),
                ],
                productType: {
                  key: "heavy-lifting-and-specialized-equipment",
                },
              })
            ),
        });

        const result = yield* runWithClient(
          findProductBySlug(ProductSlug.make("crawler-crane")),
          clientLayer
        );

        expect(Option.getOrThrow(result)).toMatchObject({
          options: [
            {
              key: "color",
              label: "Color",
              values: [{ key: "RED", label: "Rot" }],
            },
          ],
          variants: [
            {
              attributes: { color: { key: "RED", label: "Rot" } },
              optionValues: { color: "RED" },
            },
          ],
        });
      })
  );

  it.effect("fails a malformed exact Product Detail result", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        findProductBySlug: () => Effect.succeed(projection({ slug: null })),
      });

      const error = yield* runWithClient(
        findProductBySlug(ProductSlug.make("crawler-crane")).pipe(Effect.flip),
        clientLayer
      );

      expect(error).toMatchObject({
        _tag: "ProductDiscoveryFailure",
        operation: "findBySlug",
      });
    })
  );

  it.effect(
    "passes structured collection intent and returns localized title order",
    () =>
      Effect.gen(function* () {
        let receivedInput: ListCommercetoolsProductProjectionsInput | undefined;
        const clientLayer = makeClientLayer({
          listProductProjections: (input) => {
            receivedInput = input;
            return Effect.succeed([
              projection({ id: "product-z", name: "Zulu", slug: "zulu" }),
              projection({ id: "product-a", name: "Alpha", slug: "alpha" }),
            ]);
          },
        });

        const cards = yield* runWithClient(
          listProductCards(
            new ListProductCardsInput({
              categoryId: CategoryId.make("category-1"),
              limit: 3,
            })
          ),
          clientLayer
        );

        expect(receivedInput).toMatchObject({
          categoryId: "category-1",
          context,
          currency: "USD",
          limit: 3,
          locale: "en-US",
        });
        expect(cards.map(({ title }) => title)).toStrictEqual([
          "Alpha",
          "Zulu",
        ]);
      })
  );

  it.effect(
    "derives Product Card aggregates only from eligible variants and excludes the requested Product",
    () =>
      Effect.gen(function* () {
        const eligibleProduct = ProductId.make("product-eligible");
        const excludedProduct = ProductId.make("product-excluded");
        const productWithIneligibleCheapVariant = projection({
          allVariants: [
            variant({
              availability: { channels: [{ availableQuantity: 20 }] },
              id: 1,
              price: {
                discounted: null,
                value: { centAmount: 100, currencyCode: "USD" },
              },
              sku: "cheap-ineligible",
            }),
            variant({
              availability: { channels: [{ availableQuantity: 0 }] },
              id: 2,
              price: {
                discounted: null,
                value: { centAmount: 2000, currencyCode: "USD" },
              },
              sku: "eligible",
            }),
          ],
          id: eligibleProduct,
          name: "Eligible",
          slug: "eligible",
        });
        const rules = new Map([
          [
            eligibleProduct,
            [
              {
                mode: "Individual" as const,
                variantExclusion: null,
                variantSelection: {
                  skus: ["eligible"],
                  type: "includeOnly" as const,
                },
              },
            ],
          ],
          [excludedProduct, includeAll],
        ]);
        const clientLayer = makeClientLayer({
          getProductSelectionRules: () => Effect.succeed(rules),
          listProductProjections: () =>
            Effect.succeed([
              productWithIneligibleCheapVariant,
              projection({
                id: excludedProduct,
                name: "Excluded",
                slug: "excluded",
              }),
            ]),
        });

        const cards = yield* runWithClient(
          listProductCards(
            new ListProductCardsInput({
              excludeProductId: excludedProduct,
              limit: 3,
            })
          ),
          clientLayer
        );

        expect(cards).toStrictEqual([
          expect.objectContaining({
            availableForSale: false,
            id: "product-eligible",
            startingPrice: { centAmount: 2000, currencyCode: "USD" },
          }),
        ]);
      })
  );

  it.effect("omits malformed Product Cards without dropping valid cards", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        listProductProjections: () =>
          Effect.succeed([
            projection({ id: "malformed", slug: null }),
            projection({ id: "valid", slug: "valid" }),
          ]),
      });

      const cards = yield* runWithClient(
        listProductCards(new ListProductCardsInput({ limit: 3 })),
        clientLayer
      );

      expect(cards.map(({ id }) => id)).toStrictEqual(["valid"]);
    })
  );

  it.effect(
    "maps provider request failures to the public operation failure",
    () =>
      Effect.gen(function* () {
        const providerFailure = new Error("Commercetools unavailable");
        const clientLayer = makeClientLayer({
          listProductProjections: () =>
            Effect.fail(
              new CommercetoolsProductRequestFailure({
                cause: providerFailure,
                message: "Commercetools unavailable",
              })
            ),
        });

        const error = yield* runWithClient(
          listProductCards(new ListProductCardsInput({ limit: 3 })).pipe(
            Effect.flip
          ),
          clientLayer
        );

        expect(error).toMatchObject({
          _tag: "ProductDiscoveryFailure",
          cause: {
            _tag: "CommercetoolsProductRequestFailure",
            cause: providerFailure,
          },
          operation: "listCards",
        });
      })
  );
});
