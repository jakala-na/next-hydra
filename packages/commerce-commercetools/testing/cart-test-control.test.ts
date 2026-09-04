/* oxlint-disable typescript/promise-function-async -- The provider contract double returns an already-settled Promise. */
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { makeCommercetoolsCartTestControl } from "./cart-test-control";

describe("Commercetools Cart test control", () => {
  it("creates a provider Cart incompatible with the current Checkout rules", async () => {
    const drafts: unknown[] = [];
    const apiRoot = {
      carts: () => ({
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            drafts.push(body);
            return Promise.resolve({ body: { id: "legacy-cart" } });
          },
        }),
      }),
    };
    // SAFETY: The test control consumes only the Cart request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const providerApiRoot = apiRoot as unknown as ByProjectKeyRequestBuilder;

    const cartId = await makeCommercetoolsCartTestControl(
      providerApiRoot
    ).createLegacyCart({ currency: "USD", storeKey: "default-store" });

    expect(cartId).toBe("legacy-cart");
    expect(drafts).toStrictEqual([
      {
        currency: "USD",
        shippingMode: "Single",
        store: { key: "default-store", typeId: "store" },
      },
    ]);
  });

  it("creates and removes a customer-owned Cart fixture", async () => {
    const cartDrafts: unknown[] = [];
    const customerDrafts: unknown[] = [];
    const deletedVersions: unknown[] = [];
    const apiRoot = {
      carts: () => ({
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            cartDrafts.push(body);
            return Promise.resolve({ body: { id: "customer-cart" } });
          },
        }),
      }),
      customers: () => ({
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            customerDrafts.push(body);
            return Promise.resolve({
              body: { customer: { id: "customer-1", version: 1 } },
            });
          },
        }),
        withId: () => ({
          delete: ({ queryArgs }: { readonly queryArgs: unknown }) => ({
            execute: () => {
              deletedVersions.push(queryArgs);
              return Promise.resolve({});
            },
          }),
          get: () => ({
            execute: () =>
              Promise.resolve({ body: { id: "customer-1", version: 2 } }),
          }),
        }),
      }),
    };
    // SAFETY: The test control consumes only the request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const providerApiRoot = apiRoot as unknown as ByProjectKeyRequestBuilder;
    const control = makeCommercetoolsCartTestControl(providerApiRoot);

    const fixture = await control.createCustomerOwnedCart({
      currency: "USD",
      storeKey: "default-store",
    });
    await control.deleteCustomer(fixture.customerId);

    expect(fixture).toStrictEqual({
      cartId: "customer-cart",
      customerId: "customer-1",
    });
    expect(customerDrafts).toHaveLength(1);
    expect(cartDrafts).toStrictEqual([
      {
        currency: "USD",
        customerId: "customer-1",
        shippingMode: "Multiple",
        store: { key: "default-store", typeId: "store" },
      },
    ]);
    expect(deletedVersions).toStrictEqual([{ version: 2 }]);
  });
});
