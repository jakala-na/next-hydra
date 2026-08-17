import { makeCartProcedures } from "@repo/commerce/cart/procedures";
import {
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "@repo/commerce/domain/cart";
import { decodeAnonymousCartCookie } from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { Effect, Logger, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRuntime } from "./app-runtime";
import {
  CommerceActions,
  NextCommerce,
  type NextCommerceRequestError,
} from "./commerce-runtime";

const request = vi.hoisted(() => ({
  authUserId: undefined as string | undefined,
  commerceAccountFailure: undefined as Error | undefined,
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
  const { Effect: ProviderEffect, Layer: ProviderLayer } =
    await import("effect");
  const { AddressBook } = await import("@repo/commerce/services/address-book");
  const { Carts } = await import("@repo/commerce/services/carts");
  const { CommerceAccountUnavailable, CommerceAccounts } =
    await import("@repo/commerce/services/commerce-accounts");
  const { ProductDiscovery } = await import("@repo/commerce/product");
  const {
    CommerceBusinessUnitId,
    CommerceBusinessUnitKey,
    CommerceBusinessUnitLabel,
    CommerceBusinessUnitMembership,
    CommerceCustomerId,
  } = await import("@repo/commerce/domain/commerce-account");
  const { AuthUserId } =
    await import("@repo/commerce/domain/commerce-request-context");
  const { StoreKey } = await import("@repo/commerce/store");
  const authUserId = AuthUserId.make("auth-user-1");
  const customerId = CommerceCustomerId.make("customer-1");
  const memoryAccountsLayer = CommerceAccounts.layerMemoryFrom({
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
  });

  return {
    addressBookLayer: AddressBook.layerMemory(),
    cartsLayer: Carts.layerMemory(),
    commerceAccountsLayer: ProviderLayer.effect(
      CommerceAccounts,
      CommerceAccounts.pipe(
        ProviderEffect.map((accounts) =>
          CommerceAccounts.of({
            ...accounts,
            getCustomerIdByAuthUserId: (requestedAuthUserId) =>
              request.commerceAccountFailure === undefined
                ? accounts.getCustomerIdByAuthUserId(requestedAuthUserId)
                : ProviderEffect.fail(
                    new CommerceAccountUnavailable({
                      cause: request.commerceAccountFailure,
                      message: "Failed to resolve Commerce account",
                    })
                  ),
          })
        )
      )
    ).pipe(ProviderLayer.provide(memoryAccountsLayer)),
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  };
});

beforeEach(() => {
  request.authUserId = undefined;
  request.commerceAccountFailure = undefined;
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

  it("rejects when the trusted authenticated user ID violates its contract", async () => {
    request.authUserId = "";

    await expect(
      NextCommerce.runPromise(Effect.void.pipe(NextCommerce.provide("en-US")))
    ).rejects.toBeDefined();
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

  it("rejects the Add to Cart action when its anonymous Cart cookie cannot be persisted", async () => {
    request.setCookie.mockImplementationOnce(() => {
      throw new Error("cookie store unavailable");
    });
    const { addToCartProcedure } = makeCartProcedures(CommerceActions);
    const addToCart = addToCartProcedure.toAction();

    await expect(
      addToCart({
        productId: "product-1",
        quantity: 1,
        variantId: "variant-1",
      })
    ).rejects.toBeDefined();
  });

  it("builds an action that encodes request provisioning failures", async () => {
    const ActionFailure = Schema.Literal("invalid-request");
    const procedure = CommerceActions.procedure("CommerceTest.action")
      .input(Schema.String)
      .output(Schema.String)
      .error(ActionFailure)
      .mapError(
        (_error: NextCommerceRequestError) => "invalid-request" as const
      )
      .handle((prefix) =>
        CommerceContext.pipe(
          Effect.map((context) => `${prefix}:${context.store.locale}`)
        )
      );
    const action = procedure.toAction();

    await expect(action("locale")).resolves.toEqual({
      _tag: "Success",
      success: "locale:en-US",
    });

    request.authUserId = "";
    await expect(action("locale")).rejects.toBeDefined();
  });

  it("logs provider causes raised while an action request Layer is acquired", async () => {
    request.authUserId = "auth-user-1";
    request.commerceAccountFailure = new Error("provider credentials leaked");
    const logOutput: string[] = [];
    const logger = Logger.make(({ message }) => {
      logOutput.push(String(message));
    });
    const ActionFailure = Schema.Literal("invalid-request");
    const procedure = CommerceActions.procedure("CommerceTest.layerFailure")
      .input(Schema.String)
      .output(Schema.String)
      .error(ActionFailure)
      .mapError(
        (_error: NextCommerceRequestError) => "invalid-request" as const
      )
      .handle((prefix) =>
        CommerceContext.pipe(
          Effect.map((context) => `${prefix}:${context.store.locale}`)
        )
      );

    await expect(
      AppRuntime.runPromise(
        procedure.effect("locale").pipe(Effect.provide(Logger.layer([logger])))
      )
    ).resolves.toEqual({ _tag: "Failure", failure: "invalid-request" });
    expect(logOutput.join(" ")).toContain("Failed to resolve Commerce account");
  });
});
