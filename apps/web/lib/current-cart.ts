import "server-only";

import { CartId, StoreKey } from "@repo/commerce/domain/cart";
import { currentCartOperationFailure } from "@repo/commerce/domain/cart-errors";
import { CartStore } from "@repo/commerce/domain/cart-snapshot";
import { CheckoutLocale } from "@repo/commerce/domain/checkout";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  type CommerceContextRequest,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import type { CurrentCartCookie } from "@repo/commerce/lib/current-cart/cookie";
import { layerCommercetoolsAddressBook } from "@repo/commerce/lib/infra/commercetools/address-book";
import { layerCommercetoolsCarts } from "@repo/commerce/lib/infra/commercetools/carts";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";
import { getBusinessUnitIdFromCookieValue } from "./business-unit-cookie";

class CurrentCartRequestFailure extends Schema.TaggedErrorClass<CurrentCartRequestFailure>()(
  "CurrentCartRequestFailure",
  {
    operation: Schema.Literals(["resolveStore", "decodeAuthUserId"]),
    cause: Schema.Defect,
  }
) {}

const currentCartRequestFailure = (
  operation: "resolveStore" | "decodeAuthUserId",
  cause: unknown
) => new CurrentCartRequestFailure({ operation, cause });

interface AnonymousCartCookieRequest {
  readonly value: string | undefined;
  readonly set: (value: string) => void;
  readonly clear: () => void;
}

export interface CurrentCartRequest {
  readonly locale: Locale;
  readonly authUserId: string | undefined;
  readonly businessUnitIdCookie: string | undefined;
  readonly anonymousCartCookie: AnonymousCartCookieRequest;
}

interface CurrentCartLayerInputs {
  readonly currentCartCookie: CurrentCartCookie;
  readonly commerceContextRequest: CommerceContextRequest;
}

const makeCurrentCartLayerInputs = (request: CurrentCartRequest) =>
  Effect.gen(function* () {
    const storeContext = yield* Effect.tryPromise({
      try: () => storeService.getStoreContextByLocale(request.locale),
      catch: (cause) => currentCartRequestFailure("resolveStore", cause),
    });
    const store = new CartStore({
      locale: CheckoutLocale.make(request.locale),
      storeKey: StoreKey.make(storeContext.storeKey),
      currency: storeContext.currency,
    });

    if (request.authUserId !== undefined) {
      const authUserId = yield* Schema.decodeUnknownEffect(AuthUserId)(
        request.authUserId
      ).pipe(
        Effect.mapError((cause) =>
          currentCartRequestFailure("decodeAuthUserId", cause)
        )
      );
      const businessUnitId = getBusinessUnitIdFromCookieValue(
        request.businessUnitIdCookie
      );
      return {
        currentCartCookie: {
          set: () => Effect.void,
          clear: () => Effect.void,
        },
        commerceContextRequest: new CustomerCommerceContextRequest({
          store,
          authUserId,
          ...(businessUnitId === undefined ? {} : { businessUnitId }),
        }),
      } satisfies CurrentCartLayerInputs;
    }

    const anonymousCartId = getAnonymousCartIdFromCookieValue(
      request.anonymousCartCookie.value,
      storeContext
    );
    const currentCartCookie: CurrentCartCookie = {
      set: (cartId) =>
        Effect.try({
          try: () =>
            request.anonymousCartCookie.set(
              encodeAnonymousCartCookie(
                makeAnonymousCartCookie({ cartId, context: storeContext })
              )
            ),
          catch: currentCartOperationFailure,
        }).pipe(Effect.asVoid),
      clear: () =>
        Effect.sync(() => request.anonymousCartCookie.clear()).pipe(
          Effect.catchDefect(() => Effect.void),
          Effect.asVoid
        ),
    };
    return {
      currentCartCookie,
      commerceContextRequest: new AnonymousCommerceContextRequest({
        store,
        ...(anonymousCartId === null
          ? {}
          : { anonymousCartId: CartId.make(anonymousCartId) }),
      }),
    } satisfies CurrentCartLayerInputs;
  }).pipe(Effect.withSpan("CurrentCart.layerInputs"));

const currentCartDependencies = Layer.merge(
  layerCommercetoolsCarts,
  CartPolicies.layer
);

const makeCurrentCartLayers = ({
  commerceContextRequest,
  currentCartCookie,
}: CurrentCartLayerInputs) => {
  const commerceContext = CommerceContext.layer(commerceContextRequest).pipe(
    Layer.provide(layerCommercetoolsCommerceAccounts)
  );
  const currentCart = CurrentCart.layer(currentCartCookie).pipe(
    Layer.provide(Layer.merge(currentCartDependencies, commerceContext))
  );

  return { commerceContext, currentCart } as const;
};

export const currentCartLayer = (request: CurrentCartRequest) =>
  Layer.unwrap(
    makeCurrentCartLayerInputs(request).pipe(
      Effect.map((inputs) => makeCurrentCartLayers(inputs).currentCart)
    )
  );

const checkoutLayerFor = (inputs: CurrentCartLayerInputs) => {
  const { commerceContext, currentCart } = makeCurrentCartLayers(inputs);
  const addressBook = layerCommercetoolsAddressBook.pipe(
    Layer.provide(commerceContext)
  );
  return CheckoutSession.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        CheckoutPolicies.layer,
        commerceContext,
        currentCart,
        addressBook
      )
    ),
    Layer.merge(addressBook)
  );
};

export const checkoutLayer = (request: CurrentCartRequest) =>
  Layer.unwrap(
    makeCurrentCartLayerInputs(request).pipe(Effect.map(checkoutLayerFor))
  );
