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
          id: "type-id",
          version: 1,
          createdAt: "2026-07-28T00:00:00.000Z",
          lastModifiedAt: "2026-07-28T00:00:00.000Z",
          fieldDefinitions: request.body.fieldDefinitions ?? [],
        },
      }),
    };
  });

  const apiRoot = {
    types: () => ({
      withKey: () => ({
        get: getType,
        post: updateType,
      }),
      post: createType,
    }),
  } as unknown as ByProjectKeyRequestBuilder;

  return { apiRoot, requests };
};

describe("orderCustomFields migration", () => {
  it("creates the order-backed type and checkout contact field", async () => {
    const { apiRoot, requests } = apiRootForType();

    await migration.up(apiRoot);

    expect(requests.create).toMatchObject({
      key: "orderCustomFields",
      resourceTypeIds: ["order"],
      fieldDefinitions: [],
    });
    expect(requests.update).toMatchObject({
      version: 1,
      actions: [
        {
          action: "addFieldDefinition",
          fieldDefinition: {
            name: "checkoutContact",
            required: false,
            type: { name: "String" },
            inputHint: "MultiLine",
          },
        },
      ],
    });
  });

  it("does not add checkoutContact when the field already exists", async () => {
    const existingType = {
      id: "type-id",
      version: 2,
      key: "orderCustomFields",
      name: { "en-US": "Order Custom Fields" },
      resourceTypeIds: ["order"],
      fieldDefinitions: [
        {
          name: "checkoutContact",
          label: { "en-US": "Checkout contact" },
          required: false,
          type: { name: "String" },
        },
      ],
      createdAt: "2026-07-28T00:00:00.000Z",
      lastModifiedAt: "2026-07-28T00:00:00.000Z",
    } as const satisfies Type;
    const { apiRoot, requests } = apiRootForType(existingType);

    await migration.up(apiRoot);

    expect(requests.create).toBeUndefined();
    expect(requests.update).toBeUndefined();
  });
});
