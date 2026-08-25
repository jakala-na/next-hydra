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
  ProductSlug,
} from "@repo/commerce/product";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import { Effect, Layer } from "effect";
import { beforeEach, vi } from "vitest";

import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { CommercetoolsProductDiscoveryClient } from "./client";
import { commercetoolsProductDiscoveryClientLayer } from "./client-live";
import { productDiscoveryLayerWithClient } from "./product-discovery";

const query = vi.fn();
const mutation = vi.fn();
const PRODUCT_SELECTION_PAGE_SIZE = 500;
const PRODUCT_SELECTION_ASSIGNMENT_COUNT = PRODUCT_SELECTION_PAGE_SIZE + 1;

const graphqlClientLayer = CommercetoolsGraphQLClient.testLayer({
  mutation,
  query,
});
const productClientLayer = commercetoolsProductDiscoveryClientLayer.pipe(
  Layer.provide(graphqlClientLayer)
);

const store = resolveStore({ locale: CommerceLocale.make("en-US") });

const contextLayer = (authenticated: boolean) =>
  Layer.succeed(
    CommerceContext,
    CommerceContext.of({
      customerPrincipal: () => Effect.die("not used"),
      customerProfile: () => Effect.die("not used"),
      principal: authenticated
        ? new CustomerCommercePrincipal({
            authUserId: AuthUserId.make("auth-user-1"),
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make("business-unit-1"),
            customerId: CommerceCustomerId.make("customer-1"),
          })
        : new AnonymousCommercePrincipal({}),
      store,
    })
  );

const run = <A, E>(
  program: Effect.Effect<A, E, ProductDiscovery>,
  authenticated = false
) =>
  program.pipe(
    Effect.provide(
      productDiscoveryLayerWithClient(productClientLayer).pipe(
        Layer.provide(contextLayer(authenticated))
      )
    )
  );

const storeResponse = {
  data: {
    store: {
      distributionChannels: [{ id: "distribution-channel-1" }],
      supplyChannels: [{ id: "supply-channel-1" }, { id: "supply-channel-2" }],
    },
  },
};

beforeEach(() => {
  query.mockReset();
});

describe("Commercetools Product Discovery GraphQL client", () => {
  it.effect(
    "translates a domain slug and Store into the exact Product Projection query variables",
    () =>
      Effect.gen(function* () {
        query.mockResolvedValueOnce(storeResponse).mockResolvedValueOnce({
          data: { productProjectionSearch: { results: [] } },
        });

        yield* run(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("crawler-crane"))
          )
        );

        expect(query.mock.calls[1]?.[1]).toStrictEqual({
          currency: "USD",
          customerGroupId: undefined,
          distributionChannelId: "distribution-channel-1",
          filters: [
            {
              model: {
                value: {
                  path: "slug.en-US",
                  values: ["crawler-crane"],
                },
              },
            },
          ],
          locale: "en-US",
          supplyChannelIds: ["supply-channel-1", "supply-channel-2"],
        });
      })
  );

  it.effect(
    "uses the authenticated customer's group for buyer-segment price selection",
    () =>
      Effect.gen(function* () {
        query
          .mockResolvedValueOnce(storeResponse)
          .mockResolvedValueOnce({
            data: { customer: { customerGroup: { id: "customer-group-1" } } },
          })
          .mockResolvedValueOnce({
            data: { productProjectionSearch: { results: [] } },
          });

        yield* run(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.findBySlug(ProductSlug.make("crawler-crane"))
          ),
          true
        );

        expect(query.mock.calls[1]?.[1]).toStrictEqual({
          customerId: "customer-1",
        });
        expect(query.mock.calls[2]?.[1]).toMatchObject({
          customerGroupId: "customer-group-1",
        });
      })
  );

  it.effect(
    "translates category and limit while fixing localized title ordering",
    () =>
      Effect.gen(function* () {
        query.mockResolvedValueOnce(storeResponse).mockResolvedValueOnce({
          data: { productProjectionSearch: { results: [] } },
        });

        yield* run(
          Effect.flatMap(ProductDiscovery, (service) =>
            service.listCards(
              new ListProductCardsInput({
                categoryId: CategoryId.make("category-1"),
                limit: 3,
              })
            )
          )
        );

        expect(query.mock.calls[1]?.[1]).toMatchObject({
          filters: [
            {
              model: {
                value: {
                  path: "categories.id",
                  values: ["category-1"],
                },
              },
            },
          ],
          limit: 3,
        });
        expect(JSON.stringify(query.mock.calls[1]?.[0])).toContain(
          "name.en-US ASC"
        );
      })
  );

  it.effect("omits the category filter when no category is selected", () =>
    Effect.gen(function* () {
      query.mockResolvedValueOnce(storeResponse).mockResolvedValueOnce({
        data: { productProjectionSearch: { results: [] } },
      });

      yield* run(
        Effect.flatMap(ProductDiscovery, (service) =>
          service.listCards(
            new ListProductCardsInput({
              limit: 3,
            })
          )
        )
      );

      expect(query.mock.calls[1]?.[1]).toMatchObject({
        filters: [],
        limit: 3,
      });
    })
  );

  it.effect("maps a GraphQL response error to ProductDiscoveryFailure", () =>
    Effect.gen(function* () {
      const graphqlFailure = new Error("GraphQL unavailable");
      query
        .mockResolvedValueOnce(storeResponse)
        .mockResolvedValueOnce({ error: graphqlFailure });

      const failure = yield* run(
        Effect.flatMap(ProductDiscovery, (service) =>
          service
            .findBySlug(ProductSlug.make("crawler-crane"))
            .pipe(Effect.flip)
        )
      );

      expect(failure).toMatchObject({
        _tag: "ProductDiscoveryFailure",
        operation: "findBySlug",
      });
    })
  );

  it.effect(
    "loads every Product Selection assignment before resolving the catalog",
    () =>
      Effect.gen(function* () {
        const assignment = {
          productRef: { id: "product-1" },
          productSelection: { mode: "Individual" },
          variantExclusion: null,
          variantSelection: null,
        };
        query
          .mockResolvedValueOnce({
            data: {
              inStore: {
                productSelectionAssignments: {
                  results: Array.from(
                    { length: PRODUCT_SELECTION_PAGE_SIZE },
                    () => assignment
                  ),
                  total: PRODUCT_SELECTION_ASSIGNMENT_COUNT,
                },
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              inStore: {
                productSelectionAssignments: {
                  results: [assignment],
                  total: PRODUCT_SELECTION_ASSIGNMENT_COUNT,
                },
              },
            },
          });

        const rules = yield* Effect.flatMap(
          CommercetoolsProductDiscoveryClient,
          (client) =>
            client.getProductSelectionRules(store.storeKey, ["product-1"])
        ).pipe(Effect.provide(productClientLayer));

        expect(rules.get("product-1")).toHaveLength(
          PRODUCT_SELECTION_ASSIGNMENT_COUNT
        );
        expect(query.mock.calls.map((call) => call[1]?.offset)).toStrictEqual([
          0,
          PRODUCT_SELECTION_PAGE_SIZE,
        ]);
        expect(query.mock.calls.map((call) => call[1]?.storeKey)).toStrictEqual(
          ["default-store", "default-store"]
        );
      })
  );

  it.effect(
    "rejects unsupported Product Selection modes as malformed provider data",
    () =>
      Effect.gen(function* () {
        query.mockResolvedValueOnce({
          data: {
            inStore: {
              productSelectionAssignments: {
                results: [
                  {
                    productRef: { id: "product-1" },
                    productSelection: { mode: "FutureMode" },
                    variantExclusion: null,
                    variantSelection: null,
                  },
                ],
                total: 1,
              },
            },
          },
        });

        const failure = yield* Effect.flatMap(
          CommercetoolsProductDiscoveryClient,
          (client) =>
            client
              .getProductSelectionRules(store.storeKey, ["product-1"])
              .pipe(Effect.flip)
        ).pipe(Effect.provide(productClientLayer));

        expect(failure).toMatchObject({
          _tag: "CommercetoolsProductRequestFailure",
          message:
            "Unsupported Commercetools Product Selection mode FutureMode",
        });
      })
  );
});
