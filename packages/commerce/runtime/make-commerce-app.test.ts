import { CheckoutPayments } from "@repo/payments";
import { Effect, Layer, ManagedRuntime, Option } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  CartId,
  LineItemId,
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "../domain/cart";
import { CartSnapshotVersion } from "../domain/cart-snapshot";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "../domain/commerce-account";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
} from "../domain/commerce-request-context";
import { money } from "../domain/money";
import { CheckoutPolicies } from "../lib/checkout/checkout-policy";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import type { CurrentCartCookie } from "../lib/current-cart/cookie";
import { ProductDiscovery } from "../product/product-discovery";
import { AddressBook } from "../services/address-book";
import { CartPolicies } from "../services/cart-policies";
import { Carts } from "../services/carts";
import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceCompanyMemberships } from "../services/commerce-company-memberships";
import { CommerceContext } from "../services/commerce-context";
import { CurrentCart } from "../services/current-cart";
import { DeliveryPlanning } from "../services/delivery-planning";
import { Orders } from "../services/orders";
import { CommerceLocale, resolveStore, StoreKey } from "../store";
import type { CommerceRequestInput } from "./commerce-request";
import type {
  AddressBookRequestServices,
  CommerceRequestServices,
} from "./make-commerce-app";
import { makeCommerceApp } from "./make-commerce-app";

const authUserId = AuthUserId.make("auth-user-1");
const customerId = CommerceCustomerId.make("customer-1");
const store = resolveStore({ locale: CommerceLocale.make("en-US") });
const membership = (id: string, label: string) =>
  new CommerceBusinessUnitMembership({
    businessUnitId: CommerceBusinessUnitId.make(id),
    businessUnitKey: CommerceBusinessUnitKey.make(`${id}-key`),
    businessUnitLabel: CommerceBusinessUnitLabel.make(label),
    roles: ["admin", "buyer"],
  });
const cart = (id: string, businessUnitId: string) => ({
  buyingContext: {
    businessUnitId: CommerceBusinessUnitId.make(businessUnitId),
  },
  checkoutDetails: {},
  id: CartId.make(id),
  lineItems: [
    {
      id: LineItemId.make(`line-${id}`),
      quantity: 1,
      totalPrice: money(1000, "USD"),
      unitPrice: money(1000, "USD"),
      variant: {
        id: VariantId.make(`variant-${id}`),
        images: [],
        name: `Product ${id}`,
        productId: ProductId.make(`product-${id}`),
      },
    },
  ],
  status: "active" as const,
  storeKey: StoreKey.make("default-store"),
  totalLineItemQuantity: 1,
  totalPrice: money(1000, "USD"),
  version: CartSnapshotVersion.make("cart-1"),
});

const makeCookie = () => {
  const clear = vi.fn<CurrentCartCookie["clear"]>(() => Effect.void);
  const set = vi.fn<CurrentCartCookie["set"]>(() => Effect.void);
  return {
    adapter: { clear, set } satisfies CurrentCartCookie,
    clear,
    set,
  };
};

const anonymousRequest = (
  cookie: CurrentCartCookie,
  anonymousCartId?: CartId
): CommerceRequestInput => ({
  context:
    anonymousCartId === undefined
      ? new AnonymousCommerceContextRequest({ store })
      : new AnonymousCommerceContextRequest({ anonymousCartId, store }),
  currentCartCookie: cookie,
});

const customerRequest = (
  cookie: CurrentCartCookie,
  businessUnitId?: CommerceBusinessUnitId
): CommerceRequestInput => ({
  context:
    businessUnitId === undefined
      ? new CustomerCommerceContextRequest({ authUserId, store })
      : new CustomerCommerceContextRequest({
          authUserId,
          businessUnitId,
          store,
        }),
  currentCartCookie: cookie,
});

const makeApp = (
  addressBookLayer = AddressBook.layerMemory(),
  onStableLayerBuild?: () => void
) => {
  const cartsLayer = Carts.layerMemory({
    carts: [
      cart("cart-business-unit-1", "business-unit-1"),
      cart("cart-business-unit-2", "business-unit-2"),
    ],
  });

  return makeCommerceApp({
    addressBookLayer,
    cartPoliciesLayer: CartPolicies.layer,
    cartsLayer:
      onStableLayerBuild === undefined
        ? cartsLayer
        : Layer.mergeAll(
            cartsLayer,
            Layer.effectDiscard(Effect.sync(onStableLayerBuild))
          ),
    checkoutPaymentsLayer: CheckoutPayments.unavailableLayer,
    checkoutPoliciesLayer: CheckoutPolicies.layer,
    commerceAccountsLayer: CommerceAccounts.layerMemoryFrom({
      businessUnitMemberships: [
        {
          customerId,
          membership: membership("business-unit-1", "Business Unit One"),
          storeKey: StoreKey.make("default-store"),
        },
        {
          customerId,
          membership: membership("business-unit-2", "Business Unit Two"),
          storeKey: StoreKey.make("default-store"),
        },
      ],
      customers: [{ authUserId, customerId }],
    }),
    commerceCompanyMembershipsLayer: CommerceCompanyMemberships.layerMemory,
    deliveryPlanningLayer: DeliveryPlanning.emptyLayer,
    ordersLayer: Orders.layerMemory(),
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  });
};

const run = async <A, E>(
  app: ReturnType<typeof makeApp>,
  request: CommerceRequestInput,
  program: Effect.Effect<A, E, CommerceRequestServices>
) =>
  await Effect.runPromise(
    program.pipe(app.provide(request), Effect.provide(app.layer))
  );

const runAddressBook = async <A, E>(
  app: ReturnType<typeof makeApp>,
  request: CustomerCommerceContextRequest,
  program: Effect.Effect<A, E, AddressBookRequestServices>
) =>
  await Effect.runPromise(
    program.pipe(app.provideAddressBook(request), Effect.provide(app.layer))
  );

describe("CommerceApp composition", () => {
  it("constructs its service graph lazily", async () => {
    const constructed = vi.fn<() => void>();
    const addressBookLayer = Layer.effect(
      AddressBook,
      Effect.sync(() => {
        constructed();
        return AddressBook.of({
          get: () => Effect.die("not used"),
          list: () => Effect.succeed([]),
          save: () => Effect.die("not used"),
        });
      })
    );
    const cookie = makeCookie();
    const app = makeApp(addressBookLayer);
    const program = Effect.void.pipe(
      app.provide(anonymousRequest(cookie.adapter)),
      Effect.provide(app.layer)
    );

    expect(constructed).not.toHaveBeenCalled();
    await Effect.runPromise(program);
    expect(constructed).toHaveBeenCalledOnce();
  });

  it("provides company memberships through the stable Commerce composition", async () => {
    const app = makeApp();
    const roster = await Effect.runPromise(
      CommerceCompanyMemberships.pipe(
        Effect.flatMap((memberships) =>
          memberships.getRoster(CommerceBusinessUnitId.make("business-unit-1"))
        ),
        Effect.provide(app.layer)
      )
    );

    expect(roster.revision).toBe("0");
  });

  it("uses the Business Unit selected by the request adapter", async () => {
    const cookie = makeCookie();
    const app = makeApp();
    const principal = await run(
      app,
      customerRequest(
        cookie.adapter,
        CommerceBusinessUnitId.make("business-unit-2")
      ),
      CommerceContext.customerPrincipal()
    );

    expect(principal.businessUnitId).toBe("business-unit-2");
  });

  it("provides Address Book from authenticated Commerce Context without a Cart adapter", async () => {
    const app = makeApp();
    const principal = await runAddressBook(
      app,
      new CustomerCommerceContextRequest({
        authUserId,
        businessUnitId: CommerceBusinessUnitId.make("business-unit-2"),
        store,
      }),
      Effect.gen(function* () {
        yield* AddressBook.list();
        return yield* CommerceContext.customerPrincipal();
      })
    );

    expect(principal.businessUnitId).toBe("business-unit-2");
  });

  it("shares one request context across Cart and Checkout", async () => {
    const cookie = makeCookie();
    const app = makeApp();
    const result = await run(
      app,
      customerRequest(
        cookie.adapter,
        CommerceBusinessUnitId.make("business-unit-2")
      ),
      Effect.gen(function* () {
        const current = Option.getOrThrow(yield* CurrentCart.get());
        const checkout = yield* CheckoutSession.getCurrent();
        return {
          cartId: current.cart.id,
          checkoutCartId: checkout.cart.id,
        };
      })
    );

    expect(result).toStrictEqual({
      cartId: "cart-business-unit-2",
      checkoutCartId: "cart-business-unit-2",
    });
  });

  it("uses the request adapter to persist a new anonymous Cart", async () => {
    const cookie = makeCookie();

    const app = makeApp();
    await run(
      app,
      anonymousRequest(cookie.adapter),
      CurrentCart.addItem({
        productId: ProductId.make("product-1"),
        quantity: PositiveCartQuantity.make(1),
        variantId: VariantId.make("variant-1"),
      }).pipe(Effect.exit)
    );

    expect(cookie.set).toHaveBeenCalledExactlyOnceWith("cart-3");
  });

  it("uses the request adapter to clear an unavailable anonymous Cart", async () => {
    const cookie = makeCookie();
    const app = makeApp();
    const current = await run(
      app,
      anonymousRequest(cookie.adapter, CartId.make("missing-cart")),
      CurrentCart.get()
    );

    expect(Option.isNone(current)).toBeTruthy();
    expect(cookie.clear).toHaveBeenCalledOnce();
  });

  it("constructs request-scoped services independently from each input", async () => {
    const app = makeApp();
    const anonymousCookie = makeCookie();
    const customerCookie = makeCookie();
    const anonymous = await run(
      app,
      anonymousRequest(anonymousCookie.adapter),
      CommerceContext
    );
    const customer = await run(
      app,
      customerRequest(customerCookie.adapter),
      CommerceContext
    );

    expect(anonymous.principal._tag).toBe("AnonymousCommercePrincipal");
    expect(customer.principal._tag).toBe("CustomerCommercePrincipal");
  });

  it("builds stable services once for multiple request provisions", async () => {
    const stableLayerBuilt = vi.fn<() => void>();
    const app = makeApp(AddressBook.layerMemory(), stableLayerBuilt);
    const runtime = ManagedRuntime.make(app.layer);

    try {
      await runtime.runPromise(
        CommerceContext.pipe(
          app.provide(anonymousRequest(makeCookie().adapter))
        )
      );
      await runtime.runPromise(
        CommerceContext.pipe(app.provide(customerRequest(makeCookie().adapter)))
      );

      expect(stableLayerBuilt).toHaveBeenCalledOnce();
    } finally {
      await runtime.dispose();
    }
  });
});
