/* oxlint-disable typescript/promise-function-async -- The provider contract double returns already-settled Promises. */
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { makeCommercetoolsPaymentTestControl } from "./payment-test-control";

describe("Commercetools Payment test control", () => {
  it("finds and deletes Payments created for a Checkout", async () => {
    const deleted: { readonly id: string; readonly version: number }[] = [];
    const payments = () => ({
      withId: ({ ID }: { readonly ID: string }) => ({
        delete: ({
          queryArgs,
        }: {
          readonly queryArgs: { readonly version: number };
        }) => ({
          execute: () => {
            deleted.push({ id: ID, version: queryArgs.version });
            return Promise.resolve({});
          },
        }),
      }),
      withKey: ({ key }: { readonly key: string }) => ({
        get: () => ({
          execute: () =>
            key === "checkout-card-cart-from-input"
              ? Promise.resolve({
                  body: {
                    id: "payment-from-input",
                    interfaceId: "pi-from-input",
                    paymentMethodInfo: { paymentInterface: "Stripe" },
                    version: 3,
                  },
                })
              : Promise.reject(
                  Object.assign(new Error("Not found"), { statusCode: 404 })
                ),
        }),
      }),
    });
    // SAFETY: The test control consumes only the Payments request-builder
    // methods implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;
    const control = makeCommercetoolsPaymentTestControl(apiRoot);

    const resources = await control.getForCheckout("cart-from-input");
    expect(resources).toStrictEqual([
      {
        paymentReference: "payment-from-input",
        provider: "Stripe",
        providerReference: "pi-from-input",
        version: 3,
      },
    ]);
    const [payment] = resources;
    if (payment === undefined) {
      throw new Error("Expected the Checkout Payment");
    }
    await control.delete(payment);

    expect(deleted).toStrictEqual([{ id: "payment-from-input", version: 3 }]);
  });
});
