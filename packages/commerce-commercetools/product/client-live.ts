import {
  type FragmentOf,
  graphql,
  type ResultOf,
  readFragment,
} from "@repo/commerce/graphql";
import { graphqlClient } from "@repo/commerce/lib/client/graphql-client";
import { Effect, Layer } from "effect";
import {
  CommercetoolsProductDiscoveryClient,
  type CommercetoolsProductProjection,
  CommercetoolsProductRequestFailure,
  type CommercetoolsProductSelectionRule,
  type CommercetoolsProductVariant,
  type FindCommercetoolsProductBySlugInput,
  type ListCommercetoolsProductProjectionsInput,
  type ResolveCommercetoolsProductContextInput,
} from "./client";

const PRODUCT_SELECTION_ASSIGNMENTS_PAGE_LIMIT = 500;

const productProjectionFragment = graphql(`
  fragment ProviderProductDiscoveryProjection on ProductProjection {
    id
    name(locale: $locale)
    description(locale: $locale)
    slug(locale: $locale)
    categories {
      id
      name(locale: $locale)
      slug(locale: $locale)
    }
    productType {
      key
    }
    masterVariant {
      images {
        url
        label
      }
    }
    allVariants {
      id
      sku
      images {
        url
        label
      }
      attributesRaw {
        name
        value
      }
      price(
        currency: $currency
        channelId: $distributionChannelId
        customerGroupId: $customerGroupId
      ) {
        value {
          centAmount
          currencyCode
        }
        discounted {
          value {
            centAmount
            currencyCode
          }
        }
      }
      availability {
        channels(includeChannelIds: $supplyChannelIds) {
          results {
            availability {
              availableQuantity
            }
          }
        }
      }
    }
  }
`);

const findProductBySlugQuery = graphql(
  `
    query ProviderProductBySlug(
      $filters: [SearchFilterInput!]
      $locale: Locale!
      $currency: Currency!
      $distributionChannelId: String!
      $supplyChannelIds: [String!]
      $customerGroupId: String
    ) {
      productProjectionSearch(filters: $filters, limit: 1) {
        results {
          ...ProviderProductDiscoveryProjection
        }
      }
    }
  `,
  [productProjectionFragment]
);

const resolveStoreQuery = graphql(`
  query ResolveProviderProductStore($storeKey: String!) {
    store(key: $storeKey) {
      distributionChannels {
        id
      }
      supplyChannels {
        id
      }
    }
  }
`);

const resolveCustomerGroupQuery = graphql(`
  query ResolveProviderProductCustomerGroup($customerId: String!) {
    customer(id: $customerId) {
      customerGroup {
        id
      }
    }
  }
`);

const productSelectionAssignmentsQuery = graphql(`
  query ProviderProductSelectionAssignments(
    $storeKey: KeyReferenceInput!
    $where: String!
    $limit: Int!
    $offset: Int!
  ) {
    inStore(key: $storeKey) {
      productSelectionAssignments(
        where: $where
        limit: $limit
        offset: $offset
      ) {
        total
        results {
          productSelection {
            mode
          }
          productRef {
            id
          }
          variantSelection {
            type
            skus
          }
          variantExclusion {
            skus
          }
        }
      }
    }
  }
`);

type ProductSelectionAssignment = ResultOf<
  typeof productSelectionAssignmentsQuery
>["inStore"]["productSelectionAssignments"]["results"][number];

const toVariant = (
  variant: ReturnType<
    typeof readFragment<
      typeof productProjectionFragment,
      FragmentOf<typeof productProjectionFragment>
    >
  >["allVariants"][number]
): CommercetoolsProductVariant => ({
  id: variant.id,
  sku: variant.sku,
  images: variant.images,
  attributesRaw: variant.attributesRaw,
  price:
    variant.price === null
      ? null
      : {
          value: variant.price.value,
          discounted:
            variant.price.discounted === null
              ? null
              : { value: variant.price.discounted.value },
        },
  availability:
    variant.availability === null
      ? null
      : {
          channels: variant.availability.channels.results.map(
            ({ availability }) => ({
              availableQuantity: availability.availableQuantity,
            })
          ),
        },
});

const toProjection = (
  data: FragmentOf<typeof productProjectionFragment>
): CommercetoolsProductProjection => {
  const product = readFragment(productProjectionFragment, data);
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    slug: product.slug,
    categories: product.categories.map(({ id, name, slug }) => ({
      id,
      name,
      slug,
    })),
    productType: product.productType,
    masterVariant: product.masterVariant,
    allVariants: product.allVariants.map(toVariant),
  };
};

const failOnGraphqlError = <T extends { readonly error?: unknown }>(
  response: T
): T => {
  if (response.error !== undefined) {
    throw response.error;
  }
  return response;
};

const tryProviderRequest = <A>(request: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: request,
    catch: (cause) =>
      cause instanceof CommercetoolsProductRequestFailure
        ? cause
        : new CommercetoolsProductRequestFailure({
            message: "Commercetools Product request failed",
            cause,
          }),
  });

const isVariantSelectionType = (
  value: string
): value is "includeOnly" | "includeAllExcept" =>
  value === "includeOnly" || value === "includeAllExcept";

const mapVariantSelection = (
  selection: { readonly type: string; readonly skus: readonly string[] } | null
): CommercetoolsProductSelectionRule["variantSelection"] => {
  if (selection === null) {
    return null;
  }
  if (!isVariantSelectionType(selection.type)) {
    throw new CommercetoolsProductRequestFailure({
      message: `Unsupported Commercetools Product Selection type ${selection.type}`,
    });
  }
  return { type: selection.type, skus: selection.skus };
};

const productQueryVariables = (
  input:
    | FindCommercetoolsProductBySlugInput
    | ListCommercetoolsProductProjectionsInput
) => ({
  locale: input.locale,
  currency: input.currency,
  distributionChannelId: input.context.distributionChannelId,
  supplyChannelIds: [...input.context.supplyChannelIds],
  customerGroupId: input.context.customerGroupId,
});

const escapePredicateValue = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

export const commercetoolsProductDiscoveryClientLayer = Layer.sync(
  CommercetoolsProductDiscoveryClient,
  () => {
    const client = graphqlClient();

    return CommercetoolsProductDiscoveryClient.of({
      resolveProductContext: Effect.fn(
        "CommercetoolsProductDiscoveryClient.resolveProductContext"
      )((input: ResolveCommercetoolsProductContextInput) =>
        tryProviderRequest(async () => {
          const storeResponse = failOnGraphqlError(
            await client.query(resolveStoreQuery, {
              storeKey: input.storeKey,
            })
          );
          const store = storeResponse.data?.store;
          if (store === undefined || store === null) {
            throw new CommercetoolsProductRequestFailure({
              message: `Commercetools Store ${input.storeKey} was not found`,
            });
          }
          const distributionChannelId = store.distributionChannels[0]?.id;
          if (distributionChannelId === undefined) {
            throw new CommercetoolsProductRequestFailure({
              message: `Commercetools Store ${input.storeKey} has no distribution channel`,
            });
          }
          const customerGroupId =
            input.customerId === undefined
              ? undefined
              : failOnGraphqlError(
                  await client.query(resolveCustomerGroupQuery, {
                    customerId: input.customerId,
                  })
                ).data?.customer?.customerGroup?.id;

          return {
            distributionChannelId,
            supplyChannelIds: store.supplyChannels.map(({ id }) => id),
            ...(customerGroupId === undefined ? {} : { customerGroupId }),
          };
        })
      ),
      findProductBySlug: Effect.fn(
        "CommercetoolsProductDiscoveryClient.findProductBySlug"
      )((input) =>
        tryProviderRequest(async () => {
          const response = failOnGraphqlError(
            await client.query(findProductBySlugQuery, {
              filters: [
                {
                  model: {
                    value: {
                      path: `slug.${input.locale}`,
                      values: [input.slug],
                    },
                  },
                },
              ],
              ...productQueryVariables(input),
            })
          );
          const product =
            response.data?.productProjectionSearch.results[0] ?? null;
          return product === null ? null : toProjection(product);
        })
      ),
      listProductProjections: Effect.fn(
        "CommercetoolsProductDiscoveryClient.listProductProjections"
      )((input) =>
        tryProviderRequest(async () => {
          const query = graphql(
            `
              query ProviderProductCards(
                $filters: [SearchFilterInput!]
                $limit: Int!
                $locale: Locale!
                $currency: Currency!
                $distributionChannelId: String!
                $supplyChannelIds: [String!]
                $customerGroupId: String
              ) {
                productProjectionSearch(
                  filters: $filters
                  sorts: ["name.${input.locale} ASC"]
                  limit: $limit
                ) {
                  results {
                    ...ProviderProductDiscoveryProjection
                  }
                }
              }
            `,
            [productProjectionFragment]
          );
          const filters =
            input.categoryId === undefined
              ? []
              : [
                  {
                    model: {
                      value: {
                        path: "categories.id",
                        values: [input.categoryId],
                      },
                    },
                  },
                ];
          const response = failOnGraphqlError(
            await client.query(query, {
              filters,
              limit: input.limit,
              ...productQueryVariables(input),
            })
          );
          return (response.data?.productProjectionSearch.results ?? []).map(
            toProjection
          );
        })
      ),
      getProductSelectionRules: Effect.fn(
        "CommercetoolsProductDiscoveryClient.getProductSelectionRules"
      )((storeKey, productIds) =>
        tryProviderRequest(async () => {
          if (productIds.length === 0) {
            return new Map<
              string,
              readonly CommercetoolsProductSelectionRule[]
            >();
          }
          const quotedIds = productIds
            .map((id) => `"${escapePredicateValue(id)}"`)
            .join(",");
          const assignments: ProductSelectionAssignment[] = [];
          let offset = 0;
          let total = 0;

          do {
            const response = failOnGraphqlError(
              await client.query(productSelectionAssignmentsQuery, {
                storeKey: { key: storeKey },
                where: `product(id in (${quotedIds}))`,
                limit: PRODUCT_SELECTION_ASSIGNMENTS_PAGE_LIMIT,
                offset,
              })
            );
            const page = response.data?.inStore.productSelectionAssignments;
            if (page === undefined) {
              throw new CommercetoolsProductRequestFailure({
                message:
                  "Commercetools Product Selection response was missing data",
              });
            }
            if (page.results.length === 0 && offset < page.total) {
              throw new CommercetoolsProductRequestFailure({
                message:
                  "Commercetools Product Selection pagination made no progress",
              });
            }
            assignments.push(...page.results);
            offset += page.results.length;
            total = page.total;
          } while (offset < total);

          const rulesByProduct = new Map<
            string,
            CommercetoolsProductSelectionRule[]
          >();

          for (const assignment of assignments) {
            const mode = assignment.productSelection?.mode;
            if (mode !== "Individual" && mode !== "IndividualExclusion") {
              throw new CommercetoolsProductRequestFailure({
                message: `Unsupported Commercetools Product Selection mode ${mode ?? "missing"}`,
              });
            }
            const rules = rulesByProduct.get(assignment.productRef.id) ?? [];
            rules.push({
              mode,
              variantSelection: mapVariantSelection(
                assignment.variantSelection
              ),
              variantExclusion: assignment.variantExclusion,
            });
            rulesByProduct.set(assignment.productRef.id, rules);
          }
          return rulesByProduct;
        })
      ),
    });
  }
);
