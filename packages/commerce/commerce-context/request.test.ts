import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PositiveCartQuantity, ProductId, VariantId } from "../domain/cart";
import {
  decodeAnonymousCartCookie,
  encodeAnonymousCartCookie,
  makeAnonymousCartCookie,
} from "../lib/cart/utils/anonymous-cart-cookies";
import { CommerceContext } from "../services/commerce-context";
import { CurrentCart } from "../services/current-cart";
import {
  CommerceLocale,
  StoreKey as CommerceStoreKey,
  resolveStore,
} from "../store";
import { commerceRequestLayer } from "./request";

const requestBoundary = vi.hoisted(() => ({
  authUserId: "auth-user-1" as string | undefined,
  cookies: new Map<string, string>(),
  deleteCookie: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = requestBoundary.cookies.get(name);
      return value === undefined ? undefined : { value };
    },
    set: requestBoundary.setCookie,
    delete: requestBoundary.deleteCookie,
  }),
}));
vi.mock("@repo/commerce/layers", async () => {
  const [
    { AddressBook },
    {
      CommerceBusinessUnitId,
      CommerceBusinessUnitKey,
      CommerceBusinessUnitLabel,
      CommerceBusinessUnitMembership,
      CommerceCustomerId,
    },
    { AuthUserId },
    { ProductDiscovery },
    { Carts },
    { CommerceAccounts },
    { CommerceIdentity },
    { StoreKey },
  ] = await Promise.all([
    import("../services/address-book"),
    import("../domain/commerce-account"),
    import("../domain/commerce-request-context"),
    import("../product/product-discovery"),
    import("../services/carts"),
    import("../services/commerce-accounts"),
    import("../services/commerce-identity"),
    import("../store"),
  ]);
  const authUserId = AuthUserId.make("auth-user-1");
  const customerId = CommerceCustomerId.make("customer-1");
  const membership = (id: string, label: string) =>
    new CommerceBusinessUnitMembership({
      businessUnitId: CommerceBusinessUnitId.make(id),
      businessUnitKey: CommerceBusinessUnitKey.make(`${id}-key`),
      businessUnitLabel: CommerceBusinessUnitLabel.make(label),
    });

  return {
    addressBookLayer: AddressBook.layerMemory(),
    cartsLayer: Carts.layerMemory(),
    commerceAccountsLayer: CommerceAccounts.layerMemoryFrom({
      customers: [{ authUserId, customerId }],
      businessUnitMemberships: [
        {
          customerId,
          storeKey: StoreKey.make("default-store"),
          membership: membership("business-unit-1", "Business Unit One"),
        },
        {
          customerId,
          storeKey: StoreKey.make("default-store"),
          membership: membership("business-unit-2", "Business Unit Two"),
        },
      ],
    }),
    commerceIdentityLayer: async () =>
      CommerceIdentity.layer(requestBoundary.authUserId),
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  };
});

beforeEach(() => {
  requestBoundary.authUserId = "auth-user-1";
  requestBoundary.cookies.clear();
  requestBoundary.deleteCookie.mockClear();
  requestBoundary.setCookie.mockClear();
});

describe("commerceRequestLayer", () => {
  it("accepts an explicitly selected Store key", async () => {
    requestBoundary.authUserId = undefined;

    const layer = await commerceRequestLayer(
      "en-US",
      CommerceStoreKey.make("default-store")
    );
    const context = await Effect.runPromise(
      CommerceContext.pipe(Effect.provide(layer))
    );

    expect(context.store.storeKey).toBe("default-store");
  });

  it("uses the selected Business Unit from the request cookie", async () => {
    requestBoundary.cookies.set("business-unit-id", "business-unit-2");

    const layer = await commerceRequestLayer("en-US");
    const principal = await Effect.runPromise(
      CommerceContext.customerPrincipal().pipe(Effect.provide(layer))
    );

    expect(principal.businessUnitId).toBe("business-unit-2");
  });

  it("writes a newly created anonymous Cart to the canonical cookie", async () => {
    requestBoundary.authUserId = undefined;
    const layer = await commerceRequestLayer("en-US");

    await Effect.runPromise(
      CurrentCart.addItem({
        productId: ProductId.make("product-1"),
        variantId: VariantId.make("variant-1"),
        quantity: PositiveCartQuantity.make(1),
      }).pipe(Effect.exit, Effect.provide(layer))
    );

    expect(requestBoundary.setCookie).toHaveBeenCalledOnce();
    const [name, value, options] =
      requestBoundary.setCookie.mock.calls[0] ?? [];
    expect(name).toBe("cart");
    expect(decodeAnonymousCartCookie(value)).toMatchObject({
      cartId: "cart-1",
      currency: "USD",
      locale: "en-US",
      storeKey: "default-store",
    });
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7_776_000,
    });
  });

  it("reads and clears a canonical cookie whose Cart no longer exists", async () => {
    requestBoundary.authUserId = undefined;
    const store = resolveStore({ locale: CommerceLocale.make("en-US") });
    requestBoundary.cookies.set(
      "cart",
      encodeAnonymousCartCookie(
        makeAnonymousCartCookie({ cartId: "missing-cart", store })
      )
    );
    const layer = await commerceRequestLayer("en-US");

    const current = await Effect.runPromise(
      CurrentCart.get().pipe(Effect.provide(layer))
    );

    expect(Option.isNone(current)).toBe(true);
    expect(requestBoundary.deleteCookie).toHaveBeenCalledExactlyOnceWith(
      "cart"
    );
  });

  it("constructs Commerce Identity from each request independently", async () => {
    requestBoundary.authUserId = undefined;
    const anonymousLayer = await commerceRequestLayer("en-US");
    requestBoundary.authUserId = "auth-user-1";
    const customerLayer = await commerceRequestLayer("en-US");

    const [anonymous, customer] = await Promise.all([
      Effect.runPromise(CommerceContext.pipe(Effect.provide(anonymousLayer))),
      Effect.runPromise(CommerceContext.pipe(Effect.provide(customerLayer))),
    ]);

    expect(anonymous.principal._tag).toBe("AnonymousCommercePrincipal");
    expect(customer.principal._tag).toBe("CustomerCommercePrincipal");
  });
});
