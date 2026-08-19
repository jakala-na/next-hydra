import { ActionClient, ActionMiddleware } from "@repo/actions";
/* oxlint-disable promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- Effect combinators use callback APIs to transform Effect values. */
import { makeCartProcedures } from "@repo/commerce/cart/procedures";
import {
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "@repo/commerce/domain/cart";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { decodeAnonymousCartCookie } from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { ProductDiscovery } from "@repo/commerce/product";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import type { CommerceRequestServices } from "@repo/commerce/runtime/make-commerce-app";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Carts } from "@repo/commerce/services/carts";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { StoreKey } from "@repo/commerce/store";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Logger, ManagedRuntime, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { makeNextCommerceRequest } from "./commerce-request";
import type { CurrentAuthSnapshot } from "./current-auth-api";
import { CurrentAuth } from "./current-auth-api";
import { NextRequestApi } from "./next-request-api";

const authUserId = AuthUserId.make("auth-user-1");
const customerId = CommerceCustomerId.make("customer-1");

const logCommerceRequestCause = (error: CommerceAccountUnavailable) =>
  Effect.logError(error.message, error.cause ?? error).pipe(
    Effect.annotateLogs({
      "commerce.error.tag": error._tag,
    })
  );

const makeTestCommerceApp = (options?: {
  readonly commerceAccountFailure?: Error;
}) => {
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

  return makeCommerceApp({
    addressBookLayer: AddressBook.layerMemory(),
    cartPoliciesLayer: CartPolicies.layer,
    cartsLayer: Carts.layerMemory(),
    checkoutPoliciesLayer: CheckoutPolicies.layer,
    commerceAccountsLayer: Layer.effect(
      CommerceAccounts,
      CommerceAccounts.pipe(
        Effect.map((accounts) =>
          CommerceAccounts.of({
            ...accounts,
            getCustomerIdByAuthUserId: (requestedAuthUserId) =>
              options?.commerceAccountFailure === undefined
                ? accounts.getCustomerIdByAuthUserId(requestedAuthUserId)
                : Effect.fail(
                    new CommerceAccountUnavailable({
                      cause: options.commerceAccountFailure,
                      message: "Failed to resolve Commerce account",
                    })
                  ),
          })
        )
      )
    ).pipe(Layer.provide(memoryAccountsLayer)),
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  });
};

const makeCookieStore = (cookies: Map<string, string>) => {
  const store = {
    delete: (name: string) => {
      cookies.delete(name);
    },
    get: (name: string) => {
      const value = cookies.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      cookies.set(name, value);
    },
  };

  return store;
};

const makeHarness = (options?: {
  readonly commerceAccountFailure?: Error;
  readonly session?: CurrentAuthSnapshot;
  readonly setCookie?: (name: string, value: string) => void;
}) => {
  const cookies = new Map<string, string>();
  const cookieStore = makeCookieStore(cookies);
  if (options?.setCookie !== undefined) {
    cookieStore.set = options.setCookie;
  }
  const session: CurrentAuthSnapshot = options?.session ?? { permissions: [] };
  const commerceApp = makeTestCommerceApp({
    commerceAccountFailure: options?.commerceAccountFailure,
  });

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      commerceApp.layer,
      Layer.succeed(CurrentAuth, {
        snapshot: Effect.succeed(session),
      }),
      Layer.succeed(NextRequestApi, {
        connect: () => Effect.void,
        getCookies: () => Effect.succeed(cookieStore),
        getLocale: () => Effect.succeed("en-US" satisfies Locale),
      })
    )
  );

  const provide =
    (locale: Locale) =>
    <A, E>(program: Effect.Effect<A, E, CommerceRequestServices>) =>
      makeNextCommerceRequest(locale).pipe(
        Effect.flatMap((request) => program.pipe(commerceApp.provide(request)))
      );

  const TestActions = ActionClient.make(runtime)
    .use(
      ActionMiddleware.context(() =>
        Effect.succeed({ locale: "en-US" satisfies Locale })
      )
    )
    .provide(({ locale }) =>
      Layer.unwrap(
        makeNextCommerceRequest(locale).pipe(
          Effect.tapError((error) =>
            Schema.is(CommerceAccountUnavailable)(error)
              ? logCommerceRequestCause(error)
              : Effect.void
          ),
          Effect.map((request) =>
            commerceApp
              .requestLayer(request)
              .pipe(
                Layer.tapError((error) =>
                  Schema.is(CommerceAccountUnavailable)(error)
                    ? logCommerceRequestCause(error)
                    : Effect.void
                )
              )
          )
        )
      )
    );

  return {
    TestActions,
    cookieStore,
    cookies,
    provide,
    runPromise: runtime.runPromise.bind(runtime),
  };
};

describe("Next Commerce request adapter", () => {
  it("provides an anonymous Commerce Request Input", async () => {
    const { provide, runPromise } = makeHarness();

    const context = await runPromise(CommerceContext.pipe(provide("en-US")));

    expect(context.principal._tag).toBe("AnonymousCommercePrincipal");
  });

  it("provides the authenticated user and selected Business Unit", async () => {
    const { cookies, provide, runPromise } = makeHarness({
      session: { permissions: [], userId: "auth-user-1" },
    });
    cookies.set("business-unit-id", "business-unit-2");

    const principal = await runPromise(
      CommerceContext.customerPrincipal().pipe(provide("en-US"))
    );

    expect(principal.authUserId).toBe("auth-user-1");
    expect(principal.businessUnitId).toBe("business-unit-2");
  });

  it("rejects when the trusted authenticated user ID violates its contract", async () => {
    const { provide, runPromise } = makeHarness({
      session: { permissions: [], userId: "" },
    });

    await expect(
      runPromise(Effect.void.pipe(provide("en-US")))
    ).rejects.toBeDefined();
  });

  it("writes a newly created anonymous Cart with the Next cookie adapter", async () => {
    const { cookies, provide, runPromise } = makeHarness();

    await runPromise(
      CurrentCart.addItem({
        productId: ProductId.make("product-1"),
        quantity: PositiveCartQuantity.make(1),
        variantId: VariantId.make("variant-1"),
      }).pipe(Effect.exit, provide("en-US"))
    );

    const value = cookies.get("cart");
    expect(value).toBeDefined();
    expect(decodeAnonymousCartCookie(value)).toMatchObject({
      currency: "USD",
      locale: "en-US",
      storeKey: "default-store",
    });
  });

  it("rejects the Add to Cart action when its anonymous Cart cookie cannot be persisted", async () => {
    const { TestActions } = makeHarness({
      setCookie: () => {
        throw new Error("cookie store unavailable");
      },
    });
    const { addToCartProcedure } = makeCartProcedures(TestActions);
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
    const harness = makeHarness();
    const ActionFailure = Schema.Literal("invalid-request");
    const procedure = harness.TestActions.procedure("CommerceTest.action")
      .input(Schema.String)
      .output(Schema.String)
      .error(ActionFailure)
      .mapError(() => "invalid-request" as const)
      .handle((prefix) =>
        CommerceContext.pipe(
          Effect.map((context) => `${prefix}:${context.store.locale}`)
        )
      );
    const action = procedure.toAction();

    await expect(action("locale")).resolves.toStrictEqual({
      _tag: "Success",
      success: "locale:en-US",
    });

    const broken = makeHarness({
      session: { permissions: [], userId: "" },
    });
    const brokenAction = broken.TestActions.procedure(
      "CommerceTest.actionBroken"
    )
      .input(Schema.String)
      .output(Schema.String)
      .error(ActionFailure)
      .mapError(() => "invalid-request" as const)
      .handle((prefix) =>
        CommerceContext.pipe(
          Effect.map((context) => `${prefix}:${context.store.locale}`)
        )
      )
      .toAction();

    await expect(brokenAction("locale")).rejects.toBeDefined();
  });

  it("logs provider causes raised while an action request Layer is acquired", async () => {
    const logOutput: string[] = [];
    const logger = Logger.make(({ message }) => {
      logOutput.push(String(message));
    });
    const { TestActions, runPromise } = makeHarness({
      commerceAccountFailure: new Error("provider credentials leaked"),
      session: { permissions: [], userId: "auth-user-1" },
    });
    const ActionFailure = Schema.Literal("invalid-request");
    const procedure = TestActions.procedure("CommerceTest.layerFailure")
      .input(Schema.String)
      .output(Schema.String)
      .error(ActionFailure)
      .mapError(() => "invalid-request" as const)
      .handle((prefix) =>
        CommerceContext.pipe(
          Effect.map((context) => `${prefix}:${context.store.locale}`)
        )
      );

    await expect(
      runPromise(
        procedure.effect("locale").pipe(Effect.provide(Logger.layer([logger])))
      )
    ).resolves.toStrictEqual({ _tag: "Failure", failure: "invalid-request" });
    expect(logOutput.join(" ")).toContain("Failed to resolve Commerce account");
  });
});
