/* oxlint-disable typescript/promise-function-async -- The provider contract double returns already-settled Promises. */
import type {
  ByProjectKeyRequestBuilder,
  TypeDraft,
  TypeUpdate,
} from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { migration } from "./scripts/2026-08-31-140000-add-checkout-payment";

describe("Add Checkout Payment Fields migration", () => {
  it("adds only the persisted Payment fields", async () => {
    const creates: TypeDraft[] = [];
    let update: TypeUpdate | undefined;
    const types = () => ({
      post: (request: { readonly body: TypeDraft }) => ({
        execute: () => {
          creates.push(request.body);
          return Promise.resolve({
            body: {
              ...request.body,
              createdAt: "2026-08-31T00:00:00.000Z",
              fieldDefinitions: request.body.fieldDefinitions ?? [],
              id: "payment-type-id",
              lastModifiedAt: "2026-08-31T00:00:00.000Z",
              version: 1,
            },
          });
        },
      }),
      withKey: () => ({
        get: () => ({
          execute: () =>
            Promise.reject(
              Object.assign(new Error("Type not found"), { statusCode: 404 })
            ),
        }),
        post: (request: { readonly body: TypeUpdate }) => ({
          execute: () => {
            update = request.body;
            return Promise.resolve({});
          },
        }),
      }),
    });
    // SAFETY: The migration consumes only the Types request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { types } as unknown as ByProjectKeyRequestBuilder;

    await migration.up(apiRoot);

    expect(creates).toMatchObject([
      {
        key: "checkoutPaymentFields",
        resourceTypeIds: ["payment"],
      },
    ]);
    expect(update?.actions).toHaveLength(4);
    expect(update).toMatchObject({
      actions: [
        {
          action: "addFieldDefinition",
          fieldDefinition: { name: "checkoutPlacementAttemptReference" },
        },
        {
          action: "addFieldDefinition",
          fieldDefinition: { name: "checkoutTermsInDays" },
        },
        {
          action: "addFieldDefinition",
          fieldDefinition: { name: "checkoutCardBrand" },
        },
        {
          action: "addFieldDefinition",
          fieldDefinition: { name: "checkoutCardLastFour" },
        },
      ],
      version: 1,
    });
  });
});
