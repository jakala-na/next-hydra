import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { Schema } from "effect";

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

export interface CheckoutOrderSnapshot {
  readonly id: string;
  readonly number: string;
  readonly totalPrice: {
    readonly centAmount: number;
    readonly currencyCode: string;
  };
  readonly version: number;
}

const orderNumberForCart = (cartId: string) => `checkout-${cartId}`;

export const makeCommercetoolsOrderTestControl = (
  apiRoot: ByProjectKeyRequestBuilder
) => ({
  configureOutOfStockRejection: async (cartId: string): Promise<void> => {
    const currentCart = await apiRoot
      .carts()
      .withId({ ID: cartId })
      .get()
      .execute();
    await apiRoot
      .carts()
      .withId({ ID: cartId })
      .post({
        body: {
          actions: currentCart.body.lineItems.map((lineItem) => ({
            action: "setLineItemInventoryMode" as const,
            inventoryMode: "ReserveOnOrder" as const,
            lineItemId: lineItem.id,
          })),
          version: currentCart.body.version,
        },
      })
      .execute();
  },
  deleteForCheckout: async (cartId: string): Promise<void> => {
    try {
      const current = await apiRoot
        .orders()
        .withOrderNumber({ orderNumber: orderNumberForCart(cartId) })
        .get()
        .execute();
      await apiRoot
        .orders()
        .withId({ ID: current.body.id })
        .delete({ queryArgs: { version: current.body.version } })
        .execute();
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  },
  getForCheckout: async (
    cartId: string
  ): Promise<CheckoutOrderSnapshot | null> => {
    try {
      const response = await apiRoot
        .orders()
        .withOrderNumber({ orderNumber: orderNumberForCart(cartId) })
        .get()
        .execute();
      return {
        id: response.body.id,
        number: response.body.orderNumber ?? "",
        totalPrice: response.body.totalPrice,
        version: response.body.version,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  },
});
