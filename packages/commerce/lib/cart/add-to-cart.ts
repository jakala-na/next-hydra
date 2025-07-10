import { graphqlClient } from '../../client';
import { graphql } from '../../graphql';

export interface AddToCartParams {
  cartId: string;
  version: number;
  productId?: string;
  sku?: string;
  variantId?: number;
  quantity: number;
  key?: string;
}

const AddLineItemToCartMutation = graphql(`
  mutation AddLineItemToCart($cartId: String!, $version: Long!, $lineItem: AddCartLineItem!) {
    updateCart(id: $cartId, version: $version, actions: [{ addLineItem: $lineItem }]) {
      id
      version
      lineItems {
        id
        key
        productId
        name(locale: "en")
        quantity
        price {
          value {
            currencyCode
            centAmount
          }
        }
        totalPrice {
          currencyCode
          centAmount
        }
      }
      totalPrice {
        currencyCode
        centAmount
      }
    }
  }
`);

export async function addItemToCart(params: AddToCartParams) {
  const client = graphqlClient();

  try {
    const result = await client.mutation(AddLineItemToCartMutation, {
      cartId: params.cartId,
      version: params.version,
      lineItem: {
        productId: params.productId,
        sku: params.sku,
        variantId: params.variantId,
        quantity: params.quantity,
        key: params.key,
      },
    });

    if (result.error) {
      throw new Error(`Failed to add item to cart: ${result.error.message}`);
    }

    return result.data?.updateCart;
  } catch (error) {
    console.error('Error adding item to cart:', error);
    throw error;
  }
}
