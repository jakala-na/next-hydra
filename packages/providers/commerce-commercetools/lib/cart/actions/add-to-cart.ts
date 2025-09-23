'use server';
import { addItemToCart } from '../add-to-cart';
import { getOrCreateActiveCart } from '../queries/get-active-cart';

export interface AddToCartActionParams {
  productId?: string;
  sku?: string;
  variantId?: number;
  quantity: number;
  customerId?: string;
  key?: string;
}

export async function addToCartAction(params: AddToCartActionParams) {
  try {
    // If no customerId, we'll need to handle anonymous carts later
    // For now, require a customerId
    if (!params.customerId) {
      throw new Error('Customer ID is required');
    }

    // Get or create an active cart for the customer
    const cart = await getOrCreateActiveCart(params.customerId);

    if (!cart) {
      throw new Error('Failed to get or create cart');
    }

    // Add the item to the cart
    const updatedCart = await addItemToCart({
      cartId: cart.id,
      version: cart.version,
      productId: params.productId,
      sku: params.sku,
      variantId: params.variantId,
      quantity: params.quantity,
      key: params.key,
    });

    return {
      success: true,
      cart: updatedCart,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
