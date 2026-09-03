/* oxlint-disable typescript/promise-function-async -- The provider contract double returns already-settled Promises. */
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { makeCommercetoolsPaymentTestControl } from "./payment-test-control";

describe("Commercetools Payment test control", () => {
  it("reads capture-failure inputs and records the matching authorization", async () => {
    const paymentReadQueryArgs: unknown[] = [];
    const updates: unknown[] = [];
    const payment = {
      amountPlanned: { centAmount: 2500, currencyCode: "USD" },
      custom: {
        fields: {
          checkoutPlacementAttemptReference: "attempt-from-input",
        },
        type: {
          id: "payment-custom-fields-type-from-provider",
          obj: { key: "paymentCustomFields" },
          typeId: "type",
        },
      },
      id: "payment-from-input",
      interfaceId: "pi-from-input",
      paymentMethodInfo: {
        method: "card",
        paymentInterface: "Stripe",
        token: { value: "ctoken-from-input" },
      },
      version: 3,
    };
    const apiRoot = {
      carts: () => ({
        withId: () => ({
          get: () => ({
            execute: () =>
              Promise.resolve({
                body: { paymentInfo: { payments: [{ id: payment.id }] } },
              }),
          }),
        }),
      }),
      payments: () => ({
        withId: () => ({
          get: ({ queryArgs }: { readonly queryArgs?: unknown } = {}) => ({
            execute: () => {
              paymentReadQueryArgs.push(queryArgs);
              return Promise.resolve({ body: payment });
            },
          }),
          post: ({ body }: { readonly body: unknown }) => ({
            execute: () => {
              updates.push(body);
              return Promise.resolve({ body: payment });
            },
          }),
        }),
      }),
    };
    // SAFETY: The test control consumes only the Cart and Payment request-builder
    // methods implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const providerApiRoot = apiRoot as unknown as ByProjectKeyRequestBuilder;
    const control = makeCommercetoolsPaymentTestControl(providerApiRoot);

    const preparation =
      await control.getCardCaptureFailurePreparation("cart-from-input");
    await control.recordSuccessfulAuthorization(preparation, {
      cardBrand: "visa",
      lastFour: "4242",
      providerTransactionReference: "ch-from-provider",
    });

    expect(preparation).toStrictEqual({
      amount: { centAmount: 2500, currencyCode: "USD" },
      attemptReference: "attempt-from-input",
      confirmationReference: "ctoken-from-input",
      paymentReference: "payment-from-input",
      provider: "Stripe",
      providerReference: "pi-from-input",
      version: 3,
    });
    expect(paymentReadQueryArgs).toStrictEqual([
      { expand: "custom.type" },
      { expand: "custom.type" },
    ]);
    expect(updates).toStrictEqual([
      {
        actions: [
          {
            action: "addTransaction",
            transaction: {
              amount: { centAmount: 2500, currencyCode: "USD" },
              interactionId: "attempt-from-input:authorize",
              interfaceId: "ch-from-provider",
              state: "Success",
              type: "Authorization",
            },
          },
          {
            action: "setCustomField",
            name: "checkoutCardBrand",
            value: "visa",
          },
          {
            action: "setCustomField",
            name: "checkoutCardLastFour",
            value: "4242",
          },
        ],
        version: 3,
      },
    ]);
  });

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
