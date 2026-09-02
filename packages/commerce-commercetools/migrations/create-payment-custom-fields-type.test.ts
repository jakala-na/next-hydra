/* oxlint-disable typescript/promise-function-async -- The provider contract double returns already-settled Promises. */
import type {
  ByProjectKeyRequestBuilder,
  TypeDraft,
  TypeUpdate,
} from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { migration } from "./scripts/2026-09-02-120000-create-payment-custom-fields-type";

const notFound = () =>
  Promise.reject(
    Object.assign(new Error("Type not found"), { statusCode: 404 })
  );

const runMigration = async (legacyTypeExists: boolean) => {
  const creates: TypeDraft[] = [];
  const operations: string[] = [];
  let update: TypeUpdate | undefined;
  const types = () => ({
    post: (request: { readonly body: TypeDraft }) => ({
      execute: () => {
        operations.push(`create:${request.body.key}`);
        creates.push(request.body);
        return Promise.resolve({
          body: {
            ...request.body,
            createdAt: "2026-09-02T00:00:00.000Z",
            fieldDefinitions: request.body.fieldDefinitions ?? [],
            id: "payment-type-id",
            lastModifiedAt: "2026-09-02T00:00:00.000Z",
            version: 1,
          },
        });
      },
    }),
    withKey: ({ key }: { readonly key: string }) => ({
      delete: (request: {
        readonly queryArgs: { readonly version: number };
      }) => ({
        execute: () => {
          operations.push(`delete:${key}:${request.queryArgs.version}`);
          return Promise.resolve({});
        },
      }),
      get: () => ({
        execute: () => {
          operations.push(`get:${key}`);
          return key === "checkoutPaymentFields" && legacyTypeExists
            ? Promise.resolve({
                body: {
                  createdAt: "2026-08-31T00:00:00.000Z",
                  description: {},
                  fieldDefinitions: [],
                  id: "legacy-payment-type-id",
                  key,
                  lastModifiedAt: "2026-08-31T00:00:00.000Z",
                  name: { "en-US": "Checkout Payment Fields" },
                  resourceTypeIds: ["payment"],
                  version: 7,
                },
              })
            : notFound();
        },
      }),
      post: (request: { readonly body: TypeUpdate }) => ({
        execute: () => {
          operations.push(`update:${key}`);
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

  return { creates, operations, update };
};

describe("Create Payment Custom Fields Type migration", () => {
  it.each([
    {
      expectedOperations: [
        "get:checkoutPaymentFields",
        "delete:checkoutPaymentFields:7",
        "get:paymentCustomFields",
        "create:paymentCustomFields",
        "update:paymentCustomFields",
      ],
      legacyTypeExists: true,
      scenario: "replaces the discarded checkout Payment type",
    },
    {
      expectedOperations: [
        "get:checkoutPaymentFields",
        "get:paymentCustomFields",
        "create:paymentCustomFields",
        "update:paymentCustomFields",
      ],
      legacyTypeExists: false,
      scenario: "creates the Payment type in a fresh project",
    },
  ])("$scenario", async ({ expectedOperations, legacyTypeExists }) => {
    const { creates, operations, update } =
      await runMigration(legacyTypeExists);

    expect(operations).toStrictEqual(expectedOperations);
    expect(creates).toMatchObject([
      {
        key: "paymentCustomFields",
        name: { "en-US": "Payment Custom Fields" },
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
