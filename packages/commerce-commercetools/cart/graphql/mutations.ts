import { graphql } from "../../graphql";
import { CartFragment } from "./fragments";

export const CreateCartMutation = graphql(
  `
    mutation CreateCart(
      $currency: Currency!
      $storeKey: String!
      $locale: Locale!
    ) {
      createCart(draft: { currency: $currency, store: { key: $storeKey } }) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

export const AddItemToCartMutation = graphql(
  `
    mutation AddItemToCart(
      $id: String!
      $version: Long!
      $productId: String!
      $variantId: Int!
      $quantity: Long!
      $distributionChannelKey: String!
      $locale: Locale!
    ) {
      updateCart(
        id: $id
        version: $version
        actions: [
          {
            addLineItem: {
              productId: $productId
              variantId: $variantId
              quantity: $quantity
              distributionChannel: { key: $distributionChannelKey }
            }
          }
        ]
      ) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

export const ChangeItemsQuantityMutation = graphql(
  `
    mutation ChangeItemQuantity(
      $id: String!
      $version: Long!
      $lineItemId: String!
      $quantity: Long!
      $locale: Locale!
    ) {
      updateCart(
        id: $id
        version: $version
        actions: [
          {
            changeLineItemQuantity: {
              lineItemId: $lineItemId
              quantity: $quantity
            }
          }
        ]
      ) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

export const RemoveItemFromCartMutation = graphql(
  `
    mutation RemoveItemFromCart(
      $id: String!
      $version: Long!
      $lineItemId: String!
      $locale: Locale!
    ) {
      updateCart(
        id: $id
        version: $version
        actions: [{ removeLineItem: { lineItemId: $lineItemId } }]
      ) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

export const SaveCheckoutContactMutation = graphql(
  `
    mutation SaveCheckoutContact(
      $id: String!
      $version: Long!
      $actions: [CartUpdateAction!]!
      $locale: Locale!
    ) {
      updateCart(id: $id, version: $version, actions: $actions) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

export const SaveCheckoutDeliveryDetailsMutation = graphql(
  `
    mutation SaveCheckoutDeliveryDetails(
      $id: String!
      $version: Long!
      $actions: [CartUpdateAction!]!
      $locale: Locale!
    ) {
      updateCart(id: $id, version: $version, actions: $actions) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);
