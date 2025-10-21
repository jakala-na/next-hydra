import { graphqlClient } from "@repo/commerce/lib/client/graphql-client";
import type { Locale } from "@repo/i18n/types";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
import { channelFragment } from "../shared/fragments";
import type { Store } from "../types";
import type { ProductSelectionRule, StoreRepository } from "./types";

const client = graphqlClient();

const storeFragment = graphql(
  `
  fragment Store on Store {
    id
    key
    version
    name(locale: $locale)
    languages
    countries {
      code
    }
    distributionChannels {
      ...Channel
    }
    supplyChannels {
      ...Channel
    }
  }
`,
  [channelFragment]
);

function reshapeStore(_fragment: FragmentOf<typeof storeFragment>): Store {
  const storeResult = readFragment(storeFragment, _fragment);
  const distributionChannels = storeResult.distributionChannels?.map(
    (channel) => readFragment(channelFragment, channel)
  );
  const supplyChannels = storeResult.supplyChannels?.map((channel) =>
    readFragment(channelFragment, channel)
  );
  return {
    ...storeResult,
    distributionChannels,
    supplyChannels,
  };
}

const getStoreByKeyQuery = graphql(
  `
    query getStoreByKey($key: String!, $locale: Locale!) {
      store(key: $key) {
        ...Store
      }
    }
  `,
  [storeFragment]
);

export const storeRepo: StoreRepository = {
  async getStoreByKey(key: string, locale: Locale): Promise<Store> {
    const response = await client.query(getStoreByKeyQuery, { key, locale });
    if (!response.data?.store) {
      throw new Error("Store not found");
    }
    return reshapeStore(response.data.store);
  },
  async getProductSelectionsForProducts(storeKey, productIds) {
    const query = graphql(`
        query getProductSelectionAssignments($storeKey: KeyReferenceInput!, $where: String!, $limit: Int) {
          inStore(key: $storeKey) {
            productSelectionAssignments(where: $where, limit: $limit) {
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

    // Build a where predicate like: product(id in ("id1","id2"))
    const quotedIds = productIds.map((id) => `"${id}"`).join(",");
    const where = `product(id in (${quotedIds}))`;

    const response = await client.query(query, {
      storeKey,
      where,
      limit: productIds.length * 5, // at least one assignment expected, but may contain exclusions or other rules
    });

    const assignments =
      response.data?.inStore?.productSelectionAssignments?.results ?? [];

    const byProduct = new Map<string, ProductSelectionRule[]>();

    for (const assignment of assignments) {
      const productId = assignment.productRef.id;
      const rules = byProduct.get(productId) ?? [];
      if (assignment.productSelection?.mode) {
        rules.push({
          mode: assignment.productSelection.mode,
          variantSelection: assignment.variantSelection
            ? {
                type: assignment.variantSelection.type as
                  | "includeOnly"
                  | "includeAllExcept",
                skus: assignment.variantSelection.skus,
              }
            : null,
          variantExclusion: assignment.variantExclusion,
        });
        byProduct.set(productId, rules);
      }
    }

    return byProduct;
  },
};
