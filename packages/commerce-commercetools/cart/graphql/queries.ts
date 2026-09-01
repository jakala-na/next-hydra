import { graphql } from "../../graphql";
import { CartFragment } from "./fragments";

export const GetCartByIdQuery = graphql(
  `
    query CartById($id: String!, $locale: Locale!) {
      cart(id: $id) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

export const GetActiveCartForBusinessUnitAsAssociateQuery = graphql(
  `
    query GetActiveCartForBusinessUnitAsAssociate(
      $associateId: String!
      $businessUnitKey: KeyReferenceInput!
      $where: String!
      $locale: Locale!
    ) {
      asAssociate(
        associateId: $associateId
        businessUnitKey: $businessUnitKey
      ) {
        carts(where: $where, sort: ["lastModifiedAt desc"], limit: 500) {
          results {
            ...CartFields
          }
        }
      }
    }
  `,
  [CartFragment]
);

export const CartDistributionChannelQuery = graphql(`
  query ProviderCartDistributionChannel($storeKey: String!) {
    store(key: $storeKey) {
      distributionChannels {
        key
      }
    }
  }
`);
