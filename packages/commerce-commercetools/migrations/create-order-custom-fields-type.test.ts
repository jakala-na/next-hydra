import type {
  ByProjectKeyRequestBuilder,
  Type,
  TypeDraft,
  TypeUpdate,
} from "@commercetools/platform-sdk";
import { describe, expect, it, vi } from "vitest";

import { migration } from "./scripts/2026-07-28-130000-create-order-custom-fields-type";

type TypeRequestBody = {
  create?: TypeDraft;
  update?: TypeUpdate;
};

const apiRootForType = (existingType?: Type) => {
  const requests: TypeRequestBody = {};
  const getType = vi.fn(() => ({
    execute: existingType
      ? vi.fn().mockResolvedValue({ body: existingType })
      : vi.fn().mockRejectedValue({ statusCode: 404 }),
  }));
  const updateType = vi.fn((request: { readonly body: TypeUpdate }) => {
    requests.update = request.body;
    return { execute: vi.fn().mockResolvedValue({}) };
  });
  const createType = vi.fn((request: { readonly body: TypeDraft }) => {
    requests.create = request.body;
    return {
      execute: vi.fn().mockResolvedValue({
        body: {
          ...request.body,
          createdAt: "2026-07-28T00:00:00.000Z",
          fieldDefinitions: request.body.fieldDefinitions ?? [],
          id: "type-id",
          lastModifiedAt: "2026-07-28T00:00:00.000Z",
          version: 1,
        },
      }),
    };
  });

  const apiRoot = {
    types: () => ({
      post: createType,
      withKey: () => ({
        get: getType,
        post: updateType,
      }),
    }),
  } as unknown as ByProjectKeyRequestBuilder;

  return { apiRoot, requests };
};

describe("orderCustomFields migration", () => {
  it("creates the order-backed type and checkout contact field", async () => {
    const { apiRoot, requests } = apiRootForType();

    await migration.up(apiRoot);

    expect(requests.create).toMatchObject({
      fieldDefinitions: [],
      key: "orderCustomFields",
      resourceTypeIds: ["order"],
    });
    expect(requests.update).toMatchObject({
      actions: [
        {
          action: "addFieldDefinition",
          fieldDefinition: {
            inputHint: "MultiLine",
            name: "checkoutContact",
            required: false,
            type: { name: "String" },
          },
        },
      ],
      version: 1,
    });
  });

  it("does not add checkoutContact when the field already exists", async () => {
    const existingType = {
      createdAt: "2026-07-28T00:00:00.000Z",
      fieldDefinitions: [
        {
          label: { "en-US": "Checkout contact" },
          name: "checkoutContact",
          required: false,
          type: { name: "String" },
        },
      ],
      id: "type-id",
      key: "orderCustomFields",
      lastModifiedAt: "2026-07-28T00:00:00.000Z",
      name: { "en-US": "Order Custom Fields" },
      resourceTypeIds: ["order"],
      version: 2,
    } as const satisfies Type;
    const { apiRoot, requests } = apiRootForType(existingType);

    await migration.up(apiRoot);

    expect(requests.create).toBeUndefined();
    expect(requests.update).toBeUndefined();
  });
});
