import {
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "@repo/commerce/domain/cart";
import { decodeAnonymousCartCookie } from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextCommerce } from "./commerce-runtime";

const request = vi.hoisted(() => ({
  authUserId: undefined as string | undefined,
  connection: vi.fn(async () => undefined),
  cookies: new Map<string, string>(),
  deleteCookie: vi.fn(),
  locale: "en-US",
  setCookie: vi.fn(),
  withAuth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({ withAuth: request.withAuth }));
vi.mock("@repo/i18n", () => ({ getLocale: async () => request.locale }));
vi.mock("next/server", () => ({ connection: request.connection }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: request.deleteCookie,
    get: (name: string) => {
      const value = request.cookies.get(name);
      return value === undefined ? undefined : { value };
    },
    set: request.setCookie,
  }),
}));
vi.mock("@repo/commerce-provider/provider", async () => {
  const { AddressBook } = await import("@repo/commerce/services/address-book");
  const { Carts } = await import("@repo/commerce/services/carts");
  const { CommerceAccounts } = await import(
    "@repo/commerce/services/commerce-accounts"
  );
  const { ProductDiscovery } = await import("@repo/commerce/product");
  const {
    CommerceBusinessUnitId,
    CommerceBusinessUnitKey,
    CommerceBusinessUnitLabel,
    CommerceBusinessUnitMembership,
    CommerceCustomerId,
  } = await import("@repo/commerce/domain/commerce-account");
  const { AuthUserId } = await import(
    "@repo/commerce/domain/commerce-request-context"
  );
  const { StoreKey } = await import("@repo/commerce/store");
  const authUserId = AuthUserId.make("auth-user-1");
  const customerId = CommerceCustomerId.make("customer-1");

  return {
    addressBookLayer: AddressBook.layerMemory(),
    cartsLayer: Carts.layerMemory(),
    commerceAccountsLayer: CommerceAccounts.layerMemoryFrom({
      businessUnitMemberships: ["business-unit-1", "business-unit-2"].map(
        (id) => ({
          customerId,
          membership: new CommerceBusinessUnitMembership({
            businessUnitId: CommerceBusinessUnitId.make(id),
            businessUnitKey: CommerceBusinessUnitKey.make(`${id}-key`),
            businessUnitLabel: CommerceBusinessUnitLabel.make(id),
          }),
          storeKey: StoreKey.make("default-store"),
        })
      ),
      customers: [{ authUserId, customerId }],
    }),
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  };
});

beforeEach(() => {
  request.authUserId = undefined;
  request.locale = "en-US";
  request.connection.mockClear();
  request.cookies.clear();
  request.deleteCookie.mockClear();
  request.setCookie.mockReset();
  request.setCookie.mockImplementation((name, value) => {
    request.cookies.set(name, value);
  });
  request.withAuth.mockReset();
  request.withAuth.mockImplementation(async () => ({
    user:
      request.authUserId === undefined ? undefined : { id: request.authUserId },
  }));
});

describe("Next Commerce request adapter", () => {
  it("provides an anonymous Commerce Request Input", async () => {
    const context = await NextCommerce.runPromise(
      CommerceContext.pipe(NextCommerce.provide("en-US"))
    );

    expect(context.principal._tag).toBe("AnonymousCommercePrincipal");
    expect(request.connection).toHaveBeenCalledOnce();
    expect(request.withAuth).toHaveBeenCalledOnce();
  });

  it("provides the authenticated user and selected Business Unit", async () => {
    request.authUserId = "auth-user-1";
    request.cookies.set("business-unit-id", "business-unit-2");

    const principal = await NextCommerce.runPromise(
      CommerceContext.customerPrincipal().pipe(NextCommerce.provide("en-US"))
    );

    expect(principal.authUserId).toBe("auth-user-1");
    expect(principal.businessUnitId).toBe("business-unit-2");
  });

  it("reports an invalid authenticated user through the Effect error channel", async () => {
    request.authUserId = "";

    const result = await NextCommerce.runPromise(
      Effect.void.pipe(
        NextCommerce.provide("en-US"),
        Effect.catchTag("CommerceRequestFailure", () =>
          Effect.succeed("mapped")
        )
      )
    );

    expect(result).toBe("mapped");
  });

  it("writes a newly created anonymous Cart with the Next cookie adapter", async () => {
    await NextCommerce.runPromise(
      CurrentCart.addItem({
        productId: ProductId.make("product-1"),
        quantity: PositiveCartQuantity.make(1),
        variantId: VariantId.make("variant-1"),
      }).pipe(Effect.exit, NextCommerce.provide("en-US"))
    );

    expect(request.setCookie).toHaveBeenCalledOnce();
    const [name, value] = request.setCookie.mock.calls[0] ?? [];
    expect(name).toBe("cart");
    expect(decodeAnonymousCartCookie(value)).toMatchObject({
      currency: "USD",
      locale: "en-US",
      storeKey: "default-store",
    });
  });

  it("builds a Next handler with request provision and terminal execution", async () => {
    const handler = NextCommerce.build(
      (prefix: string) =>
        CommerceContext.pipe(
          Effect.map((context) => `${prefix}:${context.store.locale}`)
        ),
      {
        transform: (effect) =>
          effect.pipe(
            Effect.catchTag("CommerceRequestFailure", () =>
              Effect.succeed("invalid-request")
            )
          ),
      }
    );

    await expect(handler("locale")).resolves.toBe("locale:en-US");

    request.authUserId = "";
    await expect(handler("locale")).resolves.toBe("invalid-request");
  });
});
