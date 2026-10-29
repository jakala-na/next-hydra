import { describe, expect, it } from "@effect/vitest";
import { CommerceCustomerId } from "@repo/commerce/domain/commerce-account";
import { CategoryId, ProductSlug } from "@repo/commerce/product";
import { CommerceLocale, StoreKey, resolveStore } from "@repo/commerce/store";
import { CombinedError, createClient } from "@urql/core";
import type { Exchange } from "@urql/core";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";
import { filter, map, pipe } from "wonka";

import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { CommercetoolsConfig } from "../config/config";
import type { ResolveCommercetoolsProductContextInput } from "./client";
import { CommercetoolsProductDiscoveryClient } from "./client";
import { commercetoolsProductDiscoveryClientLayer } from "./client-live";

interface QueryVariables {
  readonly limit?: number;
  readonly offset?: number;
  readonly storeKey?: string;
}

const response = vi.fn<
  (variables: QueryVariables) => {
    readonly data?: unknown;
    readonly error?: CombinedError;
  }
>();

const fixtureExchange: Exchange = () => (operations) =>
  pipe(
    operations,
    filter((operation) => operation.kind === "query"),
    map((operation) => ({
      ...response(operation.variables ?? {}),
      hasNext: false,
      operation,
      stale: false,
    }))
  );

const graphqlClientLayer = CommercetoolsGraphQLClient.testLayer(
  createClient({
    exchanges: [fixtureExchange],
    requestPolicy: "network-only",
    url: "https://commerce.example.test/graphql",
  })
);
const clientLayerFor = (config = CommercetoolsConfig.testLayer) =>
  commercetoolsProductDiscoveryClientLayer.pipe(
    Layer.provide(Layer.merge(graphqlClientLayer, config))
  );
const clientLayer = clientLayerFor();
const store = resolveStore({ locale: CommerceLocale.make("en-US") });
const productContext = {
  distributionChannelId: "distribution-channel-1",
  distributionChannelKey: "north-america",
  storeId: "store-1",
  supplyChannelIds: ["supply-channel-1", "supply-channel-2"],
  supplyChannelKeys: ["main-warehouse", "overflow-warehouse"],
};

const productHit = (id = "product-1") => ({
  product: {
    id,
    masterData: {
      current: {
        allVariants: [
          {
            attributesRaw: [],
            availability: {
              channels: {
                results: [
                  { availability: { availableQuantity: 2 } },
                  { availability: { availableQuantity: null } },
                ],
              },
            },
            id: 1,
            images: [
              { label: null, url: "https://images.example.com/crane.jpg" },
            ],
            price: {
              discounted: { value: { centAmount: 9000, currencyCode: "USD" } },
              value: { centAmount: 10_000, currencyCode: "USD" },
            },
            sku: "crane-1",
          },
          {
            attributesRaw: [],
            availability: null,
            id: 2,
            images: [],
            price: null,
            sku: null,
          },
        ],
        categories: [{ id: "category-1", name: "Cranes", slug: "cranes" }],
        description: "Heavy lifting equipment",
        masterVariant: {
          images: [
            { label: null, url: "https://images.example.com/crane.jpg" },
          ],
        },
        name: "Crawler crane",
        slug: "crawler-crane",
      },
    },
    productType: { key: "generic-product" },
  },
});

const findProduct = () =>
  CommercetoolsProductDiscoveryClient.pipe(
    Effect.flatMap((client) =>
      client.findProductBySlug({
        context: productContext,
        currency: store.currency,
        locale: store.locale,
        slug: ProductSlug.make("crawler-crane"),
      })
    ),
    Effect.provide(clientLayer)
  );

const listProducts = (limit: number, categoryId?: CategoryId) =>
  CommercetoolsProductDiscoveryClient.pipe(
    Effect.flatMap((client) => {
      const input = {
        context: productContext,
        currency: store.currency,
        limit,
        locale: store.locale,
      };
      return client.listProductProjections(
        categoryId === undefined ? input : { ...input, categoryId }
      );
    }),
    Effect.provide(clientLayer)
  );

const resolveContext = (
  input: ResolveCommercetoolsProductContextInput,
  layer = clientLayer
) =>
  CommercetoolsProductDiscoveryClient.pipe(
    Effect.flatMap((client) => client.resolveProductContext(input)),
    Effect.provide(layer)
  );

const storeResponse = (id = "store-1") => ({
  data: {
    store: {
      distributionChannels: [
        { id: "distribution-channel-1", key: "north-america" },
      ],
      id,
      supplyChannels: [
        { id: "supply-channel-1", key: "main-warehouse" },
        { id: "supply-channel-2", key: "overflow-warehouse" },
      ],
    },
  },
});

describe("Commercetools Product discovery adapter", () => {
  beforeEach(() => response.mockReset());

  it.effect(
    "maps current data, discounts, nullable prices and channel quantities",
    () =>
      Effect.gen(function* () {
        response.mockReturnValueOnce({
          data: { productsSearch: { results: [productHit()] } },
        });
        const product = yield* findProduct();
        expect(product).toMatchObject({
          allVariants: [
            {
              availability: {
                channels: [
                  { availableQuantity: 2 },
                  { availableQuantity: null },
                ],
              },
              id: 1,
              price: {
                discounted: {
                  value: { centAmount: 9000, currencyCode: "USD" },
                },
                value: { centAmount: 10_000, currencyCode: "USD" },
              },
              sku: "crane-1",
            },
            { availability: null, id: 2, price: null, sku: null },
          ],
          categories: [{ id: "category-1", name: "Cranes", slug: "cranes" }],
          id: "product-1",
          name: "Crawler crane",
          productType: { key: "generic-product" },
          slug: "crawler-crane",
        });
      })
  );

  it.effect(
    "passes the localized slug and price/inventory context to search",
    () =>
      Effect.gen(function* () {
        response.mockReturnValueOnce({
          data: { productsSearch: { results: [] } },
        });
        expect(yield* findProduct()).toBeNull();
        expect(response).toHaveBeenCalledWith({
          currency: "USD",
          customerGroupId: undefined,
          distributionChannelId: "distribution-channel-1",
          locale: "en-US",
          query: {
            filter: [
              { exact: { field: "variants.stores", value: "store-1" } },
              {
                exact: {
                  caseInsensitive: false,
                  field: "slug",
                  language: "en-US",
                  value: "crawler-crane",
                },
              },
            ],
          },
          supplyChannelIds: ["supply-channel-1", "supply-channel-2"],
        });
      })
  );

  it.effect("batches 101 products into pages of 100 and 1", () =>
    Effect.gen(function* () {
      response
        .mockReturnValueOnce({
          data: {
            productsSearch: {
              results: Array.from({ length: 100 }, (_, i) =>
                productHit(`product-${i}`)
              ),
              total: 101,
            },
          },
        })
        .mockReturnValueOnce({
          data: {
            productsSearch: {
              results: [productHit("product-100")],
              total: 101,
            },
          },
        });
      const products = yield* listProducts(101);
      expect(products).toHaveLength(101);
      expect(products[0]?.id).toBe("product-0");
      expect(products[100]?.id).toBe("product-100");
      expect(
        response.mock.calls.map(([variables]) => ({
          limit: variables.limit,
          offset: variables.offset,
        }))
      ).toStrictEqual([
        { limit: 100, offset: 0 },
        { limit: 1, offset: 100 },
      ]);
    })
  );

  it.effect("stops when the catalog has fewer results than requested", () =>
    Effect.gen(function* () {
      response.mockReturnValueOnce({
        data: { productsSearch: { results: [productHit()], total: 1 } },
      });
      expect(yield* listProducts(101)).toHaveLength(1);
      expect(response).toHaveBeenCalledOnce();
    })
  );

  it.effect("rejects pagination that stops making progress", () =>
    Effect.gen(function* () {
      response.mockReturnValueOnce({
        data: { productsSearch: { results: [], total: 1 } },
      });
      const failure = yield* listProducts(3).pipe(Effect.flip);
      expect(failure.message).toContain("pagination made no progress");
    })
  );

  it.effect(
    "rejects requests beyond the searchable result window before querying",
    () =>
      Effect.gen(function* () {
        const failure = yield* listProducts(10_001).pipe(Effect.flip);
        expect(failure.message).toContain("at most 10000");
        expect(response).not.toHaveBeenCalled();
      })
  );

  it.each([undefined, null])(
    "returns a typed failure for missing search data (%s)",
    async (search) => {
      response.mockReturnValueOnce({ data: { productsSearch: search } });
      const failure = await findProduct().pipe(Effect.flip, Effect.runPromise);
      expect(failure._tag).toBe("CommercetoolsProductRequestFailure");
      expect(failure.message).toContain("response was missing data");
    }
  );

  it.effect(
    "returns a typed failure when current product data is unavailable",
    () =>
      Effect.gen(function* () {
        const hit = productHit();
        response.mockReturnValueOnce({
          data: {
            productsSearch: {
              results: [
                { product: { ...hit.product, masterData: { current: null } } },
              ],
            },
          },
        });
        const failure = yield* findProduct().pipe(Effect.flip);
        expect(failure._tag).toBe("CommercetoolsProductRequestFailure");
        expect(failure.message).toContain("has no current data");
      })
  );

  it.effect(
    "passes direct category membership and stable localized sorting",
    () =>
      Effect.gen(function* () {
        response.mockReturnValueOnce({
          data: { productsSearch: { results: [], total: 0 } },
        });
        yield* listProducts(3, CategoryId.make("category-1"));
        expect(response).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 3,
            offset: 0,
            query: {
              filter: [
                { exact: { field: "variants.stores", value: "store-1" } },
                { exact: { field: "categories", value: "category-1" } },
              ],
            },
            sort: [
              { field: "name", language: "en-US", order: "asc" },
              { field: "id", order: "asc" },
            ],
          })
        );
      })
  );

  it.effect("omits category filtering when no category is selected", () =>
    Effect.gen(function* () {
      response.mockReturnValueOnce({
        data: { productsSearch: { results: [], total: 0 } },
      });
      yield* listProducts(3);
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { exact: { field: "variants.stores", value: "store-1" } },
        })
      );
    })
  );

  it.effect("wraps GraphQL errors in the typed failure channel", () =>
    Effect.gen(function* () {
      const cause = new CombinedError({
        networkError: new Error("GraphQL unavailable"),
      });
      response.mockReturnValueOnce({ error: cause });
      const failure = yield* findProduct().pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "CommercetoolsProductRequestFailure",
        cause,
      });
    })
  );

  it.effect(
    "caches Store ID and Channels across buyers and request Layers",
    () =>
      Effect.gen(function* () {
        response
          .mockReturnValueOnce(storeResponse())
          .mockReturnValueOnce({
            data: { customer: { customerGroup: { id: "group-1" } } },
          })
          .mockReturnValueOnce({
            data: { customer: { customerGroup: { id: "group-2" } } },
          });
        const input = {
          locale: store.locale,
          storeKey: StoreKey.make("cache-buyers"),
        };
        const first = yield* resolveContext({
          ...input,
          customerId: CommerceCustomerId.make("buyer-1"),
        });
        const second = yield* resolveContext({
          ...input,
          customerId: CommerceCustomerId.make("buyer-2"),
        });
        const anonymous = yield* resolveContext(input);
        expect(first).toStrictEqual({
          ...productContext,
          customerGroupId: "group-1",
        });
        expect(second).toStrictEqual({
          ...productContext,
          customerGroupId: "group-2",
        });
        expect(anonymous).toStrictEqual(productContext);
        expect(
          response.mock.calls.map(([variables]) => variables)
        ).toStrictEqual([
          { storeKey: "cache-buyers" },
          { customerId: "buyer-1" },
          { customerId: "buyer-2" },
        ]);
      })
  );

  it.effect("shares concurrent Store lookups", () =>
    Effect.gen(function* () {
      response.mockReturnValueOnce(storeResponse());
      const input = {
        locale: store.locale,
        storeKey: StoreKey.make("cache-concurrent"),
      };
      const contexts = yield* Effect.all(
        [resolveContext(input), resolveContext(input)],
        { concurrency: "unbounded" }
      );
      expect(contexts).toStrictEqual([productContext, productContext]);
      expect(response).toHaveBeenCalledOnce();
    })
  );

  it.effect("refreshes Store configuration after one hour", () =>
    Effect.gen(function* () {
      response
        .mockReturnValueOnce(storeResponse("before"))
        .mockReturnValueOnce(storeResponse("after"));
      const input = {
        locale: store.locale,
        storeKey: StoreKey.make("cache-expiry"),
      };
      expect((yield* resolveContext(input)).storeId).toBe("before");
      yield* TestClock.adjust("1 hour");
      expect((yield* resolveContext(input)).storeId).toBe("after");
      expect(response).toHaveBeenCalledTimes(2);
    })
  );

  it.effect("does not retain failed Store lookups", () =>
    Effect.gen(function* () {
      response
        .mockReturnValueOnce({ data: { store: null } })
        .mockReturnValueOnce(storeResponse());
      const input = {
        locale: store.locale,
        storeKey: StoreKey.make("cache-failure"),
      };
      const failure = yield* resolveContext(input).pipe(Effect.flip);
      expect(failure._tag).toBe("CommercetoolsProductRequestFailure");
      expect(yield* resolveContext(input)).toStrictEqual(productContext);
      expect(response).toHaveBeenCalledTimes(2);
    })
  );

  it.effect(
    "isolates cached Store configuration by project, region and Store key",
    () =>
      Effect.gen(function* () {
        const baseConfig = yield* CommercetoolsConfig.pipe(
          Effect.provide(CommercetoolsConfig.testLayer)
        );
        const configurations = [
          {
            projectKey: "cache-project-a",
            region: "us-central1.gcp",
            storeKey: "store-a",
          },
          {
            projectKey: "cache-project-b",
            region: "us-central1.gcp",
            storeKey: "store-a",
          },
          {
            projectKey: "cache-project-a",
            region: "europe-west1.gcp",
            storeKey: "store-a",
          },
          {
            projectKey: "cache-project-a",
            region: "us-central1.gcp",
            storeKey: "store-b",
          },
        ];
        for (const [
          index,
          { projectKey, region, storeKey },
        ] of configurations.entries()) {
          response.mockReturnValueOnce(storeResponse(`store-${index}`));
          const layer = clientLayerFor(
            Layer.succeed(CommercetoolsConfig, {
              ...baseConfig,
              projectKey,
              region,
            })
          );
          const context = yield* resolveContext(
            { locale: store.locale, storeKey: StoreKey.make(storeKey) },
            layer
          );
          expect(context.storeId).toBe(`store-${index}`);
        }
        expect(response).toHaveBeenCalledTimes(4);
      })
  );
});
