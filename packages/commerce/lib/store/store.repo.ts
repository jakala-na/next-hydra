import { graphqlClient } from "@repo/commerce/lib/client/graphql-client";
import type { Locale } from "@repo/i18n/types";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
import { channelFragment } from "../shared/fragments";
import type { Store } from "../types";
import type { StoreRepository } from "./types";

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
};
