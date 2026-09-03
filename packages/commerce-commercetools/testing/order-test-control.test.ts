/* oxlint-disable typescript/promise-function-async -- The provider contract double returns already-settled Promises. */
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { makeCommercetoolsOrderTestControl } from "./order-test-control";

describe("Commercetools Order test control", () => {
  it("makes every current line item require inventory when arranging rejection", async () => {
    const updates: unknown[] = [];
    const apiRoot = {
      carts: () => ({
        withId: ({ ID }: { readonly ID: string }) => ({
          get: () => ({
            execute: () =>
              Promise.resolve({
                body: {
                  id: ID,
                  lineItems: [{ id: "line-1" }, { id: "line-2" }],
                  version: 7,
                },
              }),
          }),
          post: ({ body }: { readonly body: unknown }) => ({
            execute: () => {
              updates.push(body);
              return Promise.resolve({});
            },
          }),
        }),
      }),
    };
    // SAFETY: The test control consumes only the Cart request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const providerApiRoot = apiRoot as unknown as ByProjectKeyRequestBuilder;

    await makeCommercetoolsOrderTestControl(
      providerApiRoot
    ).configureOutOfStockRejection("cart-from-input");

    expect(updates).toStrictEqual([
      {
        actions: [
          {
            action: "setLineItemInventoryMode",
            inventoryMode: "ReserveOnOrder",
            lineItemId: "line-1",
          },
          {
            action: "setLineItemInventoryMode",
            inventoryMode: "ReserveOnOrder",
            lineItemId: "line-2",
          },
        ],
        version: 7,
      },
    ]);
  });
});
