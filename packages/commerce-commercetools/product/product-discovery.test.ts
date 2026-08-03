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
  type CommercetoolsProductProjection,
  CommercetoolsProductRequestFailure,
  type CommercetoolsProductSelectionRule,
  type CommercetoolsProductVariant,
  type ListCommercetoolsProductProjectionsInput,
  type CommercetoolsProductDiscoveryClient as ProductClient,
  type ResolveCommercetoolsProductContextInput,
} from "./client";
import { productDiscoveryLayerWithClient } from "./product-discovery";

const store = resolveStore({ locale: CommerceLocale.make("en-US") });
const productId = ProductId.make("product-1");

const commerceContextLayer = (authenticated = false) =>
  Layer.succeed(
    CommerceContext,
    CommerceContext.of({
      store,
      principal: authenticated
        ? new CustomerCommercePrincipal({
            authUserId: AuthUserId.make("auth-user-1"),
            customerId: CommerceCustomerId.make("customer-1"),
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make(
              "business-unit-key-1"
            ),
          })
        : new AnonymousCommercePrincipal({}),
      customerPrincipal: () => Effect.die("not used"),
      customerProfile: () => Effect.die("not used"),
    })
  );

const context = {
  distributionChannelId: "distribution-channel-1",
  supplyChannelIds: ["supply-channel-1", "supply-channel-2"],
} as const;

const variant = (
  overrides: Partial<CommercetoolsProductVariant> = {}
): CommercetoolsProductVariant => ({
  id: 1,
  sku: "sku-1",
  images: [
    {
      url: "https://images.example.com/product-1.jpg",
      label: "Product one",
    },
  ],
  attributesRaw: [
    { name: "model", value: 100 },
    {
      name: "mobility",
      value: { key: "crawler", label: "Crawler" },
    },
    {
      name: "relatedProducts",
      value: [{ typeId: "product", id: "related-product-1" }],
    },
  ],
  price: {
    value: { centAmount: 10_000, currencyCode: "USD" },
    discounted: {
      value: { centAmount: 9000, currencyCode: "USD" },
    },
  },
  availability: {
    channels: [{ availableQuantity: 2 }, { availableQuantity: 3 }],
  },
  ...overrides,
});

const projection = (
  overrides: Partial<CommercetoolsProductProjection> = {}
): CommercetoolsProductProjection => ({
  id: productId,
  name: "Crawler crane",
  description: "Heavy lifting equipment",
  slug: "crawler-crane",
  categories: [
    {
      id: "category-1",
      name: "Cranes",
      slug: "cranes",
    },
  ],
  productType: {
    key: "heavy-earthmoving-and-construction-equipment",
  },
  masterVariant: {
    images: [
      {
        url: "https://images.example.com/product-1.jpg",
        label: "Product one",
      },
    ],
  },
  allVariants: [variant()],
  ...overrides,
});

const includeAll: readonly CommercetoolsProductSelectionRule[] = [
  {
    mode: "Individual",
    variantSelection: null,
    variantExclusion: null,
  },
];

const makeClientLayer = (
  handlers: Parameters<typeof CommercetoolsProductDiscoveryClient.testLayer>[0]
) =>
  CommercetoolsProductDiscoveryClient.testLayer({
    resolveProductContext: () => Effect.succeed(context),
    getProductSelectionRules: (_storeKey, productIds) =>
      Effect.succeed(
        new Map(productIds.map((id) => [id, includeAll] as const))
      ),
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

describe("Commercetools Product Discovery", () => {
  it.effect(
    "resolves provider Store details from CommerceContext without exposing them to the caller",
    () =>
      Effect.gen(function* () {
        let receivedContext:
          | ResolveCommercetoolsProductContextInput
          | undefined;
        const clientLayer = makeClientLayer({
          resolveProductContext: (input) => {
            receivedContext = input;
            return Effect.succeed(context);
          },
          findProductBySlug: () => Effect.succeed(null),
        });

        const result = yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("missing-product"))
          ),
          clientLayer
        );

        expect(Option.isNone(result)).toBe(true);
        expect(receivedContext).toEqual({
          storeKey: "default-store",
          locale: "en-US",
          customerId: undefined,
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
          resolveProductContext: (input) => {
            receivedContext = input;
            return Effect.succeed({ ...context, customerGroupId: "segment-1" });
          },
          findProductBySlug: (input) => {
            receivedBuyerSegment = input.context.customerGroupId;
            return Effect.succeed(null);
          },
        });

        yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("missing-product"))
          ),
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
        Effect.flatMap(ProductDiscovery, (service) =>
          service.findBySlug(ProductSlug.make("crawler-crane"))
        ),
        clientLayer
      );

      expect(Option.getOrThrow(result)).toMatchObject({
        id: "product-1",
        slug: "crawler-crane",
        productType: "heavy-earthmoving-and-construction-equipment",
        title: "Crawler crane",
        defaultVariantId: "1",
        options: [
          {
            key: "model",
            label: "Model",
            values: [{ key: "100", label: "100" }],
          },
        ],
        variants: [
          {
            id: "1",
            sku: "sku-1",
            attributes: {
              model: 100,
              mobility: { key: "crawler", label: "Crawler" },
              relatedProducts: ["related-product-1"],
            },
            optionValues: { model: "100" },
            price: {
              regular: { centAmount: 10_000, currencyCode: "USD" },
              discounted: { centAmount: 9000, currencyCode: "USD" },
            },
            availability: {
              availableForSale: true,
              availableQuantity: 5,
            },
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
                    id: 1,
                    sku: "excluded",
                    attributesRaw: [{ name: "model", value: 100 }],
                  }),
                  variant({
                    id: 2,
                    sku: "eligible",
                    attributesRaw: [{ name: "model", value: 200 }],
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
                      variantSelection: {
                        type: "includeOnly" as const,
                        skus: ["eligible"],
                      },
                      variantExclusion: null,
                    },
                  ],
                ],
              ])
            ),
        });

        const result = yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("crawler-crane"))
          ),
          clientLayer
        );
        const detail = Option.getOrThrow(result);

        expect(detail.defaultVariantId).toBe("2");
        expect(detail.variants.map(({ id }) => id)).toEqual(["2"]);
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
                    variantSelection: null,
                    variantExclusion: { skus: ["excluded"] },
                  },
                ],
              ],
            ])
          ),
      });

      const result = yield* runWithClient(
        Effect.flatMap(ProductDiscovery, (service) =>
          service.findBySlug(ProductSlug.make("crawler-crane"))
        ),
        clientLayer
      );

      expect(Option.getOrThrow(result).variants.map(({ sku }) => sku)).toEqual([
        "eligible",
      ]);
    })
  );

  it.effect("treats a Product with no Store assignment as absent", () =>
    Effect.gen(function* () {
      const clientLayer = makeClientLayer({
        findProductBySlug: () => Effect.succeed(projection()),
        getProductSelectionRules: () => Effect.succeed(new Map()),
      });

      const result = yield* runWithClient(
        Effect.flatMap(ProductDiscovery, (service) =>
          service.findBySlug(ProductSlug.make("crawler-crane"))
        ),
        clientLayer
      );

      expect(Option.isNone(result)).toBe(true);
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
        Effect.flatMap(ProductDiscovery, (service) =>
          service.findBySlug(ProductSlug.make("crawler-crane"))
        ),
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
                      value: { centAmount: 10_000, currencyCode: "USD" },
                      discounted: null,
                    },
                  }),
                ],
              })
            ),
        });

        const result = yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("crawler-crane"))
          ),
          clientLayer
        );

        expect(Option.getOrThrow(result).variants[0]?.price).toEqual({
          regular: { centAmount: 10_000, currencyCode: "USD" },
        });
      })
  );

  it.effect(
    "decodes localized generated attributes and uses them as Variant options",
    () =>
      Effect.gen(function* () {
        const clientLayer = makeClientLayer({
          findProductBySlug: () =>
            Effect.succeed(
              projection({
                productType: {
                  key: "heavy-lifting-and-specialized-equipment",
                },
                allVariants: [
                  variant({
                    attributesRaw: [
                      {
                        name: "color",
                        value: {
                          key: "red",
                          label: { "en-US": "Red", "de-DE": "Rot" },
                        },
                      },
                    ],
                  }),
                ],
              })
            ),
        });

        const result = yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("crawler-crane"))
          ),
          clientLayer
        );

        expect(Option.getOrThrow(result)).toMatchObject({
          options: [
            {
              key: "color",
              label: "Color",
              values: [{ key: "red", label: "Red" }],
            },
          ],
          variants: [
            {
              attributes: { color: { key: "red", label: "Red" } },
              optionValues: { color: "red" },
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
        Effect.flatMap(ProductDiscovery, (service) =>
          service
            .findBySlug(ProductSlug.make("crawler-crane"))
            .pipe(Effect.flip)
        ),
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
          Effect.flatMap(ProductDiscovery, (service) =>
            service.listCards(
              new ListProductCardsInput({
                categoryId: CategoryId.make("category-1"),
                limit: 3,
              })
            )
          ),
          clientLayer
        );

        expect(receivedInput).toMatchObject({
          categoryId: "category-1",
          limit: 3,
          locale: "en-US",
          currency: "USD",
          context,
        });
        expect(cards.map(({ title }) => title)).toEqual(["Alpha", "Zulu"]);
      })
  );

  it.effect(
    "derives Product Card aggregates only from eligible variants and excludes the requested Product",
    () =>
      Effect.gen(function* () {
        const eligibleProduct = ProductId.make("product-eligible");
        const excludedProduct = ProductId.make("product-excluded");
        const productWithIneligibleCheapVariant = projection({
          id: eligibleProduct,
          name: "Eligible",
          slug: "eligible",
          allVariants: [
            variant({
              id: 1,
              sku: "cheap-ineligible",
              price: {
                value: { centAmount: 100, currencyCode: "USD" },
                discounted: null,
              },
              availability: { channels: [{ availableQuantity: 20 }] },
            }),
            variant({
              id: 2,
              sku: "eligible",
              price: {
                value: { centAmount: 2000, currencyCode: "USD" },
                discounted: null,
              },
              availability: { channels: [{ availableQuantity: 0 }] },
            }),
          ],
        });
        const rules = new Map([
          [
            eligibleProduct,
            [
              {
                mode: "Individual" as const,
                variantSelection: {
                  type: "includeOnly" as const,
                  skus: ["eligible"],
                },
                variantExclusion: null,
              },
            ],
          ],
          [excludedProduct, includeAll],
        ]);
        const clientLayer = makeClientLayer({
          listProductProjections: () =>
            Effect.succeed([
              productWithIneligibleCheapVariant,
              projection({
                id: excludedProduct,
                name: "Excluded",
                slug: "excluded",
              }),
            ]),
          getProductSelectionRules: () => Effect.succeed(rules),
        });

        const cards = yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.listCards(
              new ListProductCardsInput({
                limit: 3,
                excludeProductId: excludedProduct,
              })
            )
          ),
          clientLayer
        );

        expect(cards).toEqual([
          expect.objectContaining({
            id: "product-eligible",
            startingPrice: { centAmount: 2000, currencyCode: "USD" },
            availableForSale: false,
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
        Effect.flatMap(ProductDiscovery, (service) =>
          service.listCards(new ListProductCardsInput({ limit: 3 }))
        ),
        clientLayer
      );

      expect(cards.map(({ id }) => id)).toEqual(["valid"]);
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
                message: "Commercetools unavailable",
                cause: providerFailure,
              })
            ),
        });

        const error = yield* runWithClient(
          Effect.flatMap(ProductDiscovery, (service) =>
            service
              .listCards(new ListProductCardsInput({ limit: 3 }))
              .pipe(Effect.flip)
          ),
          clientLayer
        );

        expect(error).toMatchObject({
          _tag: "ProductDiscoveryFailure",
          operation: "listCards",
          cause: {
            _tag: "CommercetoolsProductRequestFailure",
            cause: providerFailure,
          },
        });
      })
  );
});
