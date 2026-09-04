import { randomUUID } from "node:crypto";

import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { CartId } from "@repo/commerce/domain/cart";

export interface CartFixtureInput {
  readonly currency: string;
  readonly storeKey: string;
}

export interface CustomerOwnedCartFixture {
  readonly cartId: CartId;
  readonly customerId: string;
}

export const makeCommercetoolsCartTestControl = (
  apiRoot: ByProjectKeyRequestBuilder
) => {
  const deleteCustomer = async (customerId: string): Promise<void> => {
    const current = await apiRoot
      .customers()
      .withId({ ID: customerId })
      .get()
      .execute();
    await apiRoot
      .customers()
      .withId({ ID: customerId })
      .delete({ queryArgs: { version: current.body.version } })
      .execute();
  };

  return {
    createCustomerOwnedCart: async (
      input: CartFixtureInput
    ): Promise<CustomerOwnedCartFixture> => {
      const customer = await apiRoot
        .customers()
        .post({
          body: {
            email: `cart-ownership-${randomUUID()}@example.com`,
            password: randomUUID(),
          },
        })
        .execute();
      try {
        const cart = await apiRoot
          .carts()
          .post({
            body: {
              currency: input.currency,
              customerId: customer.body.customer.id,
              shippingMode: "Multiple",
              store: { key: input.storeKey, typeId: "store" },
            },
          })
          .execute();
        return {
          cartId: CartId.make(cart.body.id),
          customerId: customer.body.customer.id,
        };
      } catch (error) {
        await deleteCustomer(customer.body.customer.id);
        throw error;
      }
    },
    createLegacyCart: async (input: CartFixtureInput): Promise<CartId> => {
      const response = await apiRoot
        .carts()
        .post({
          body: {
            currency: input.currency,
            shippingMode: "Single",
            store: { key: input.storeKey, typeId: "store" },
          },
        })
        .execute();

      return CartId.make(response.body.id);
    },
    deleteCustomer,
  };
};
