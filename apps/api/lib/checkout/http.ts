import type { AddressBookReference } from "@repo/commerce/domain/address-book";
import { CartId } from "@repo/commerce/domain/cart";
import { currentCartOperationFailure } from "@repo/commerce/domain/cart-errors";
import {
  AnonymousCommerceContextRequest,
  type AuthUserId,
  type CommerceContextRequest,
  CommerceRequestContextNotFound,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  CheckoutApiBadRequest,
  CheckoutApiConflict,
  CheckoutApiError,
  CheckoutApiNotFound,
  CheckoutHttpApi,
  CheckoutRequestHeaders,
  CheckoutSchemaErrorMiddleware,
  CheckoutSessionMiddleware,
} from "@repo/commerce/http/checkout-api";
import { checkoutApiErrorMessage } from "@repo/commerce/http/checkout-api-messages";
import { toCheckoutApiState } from "@repo/commerce/http/checkout-api-state";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import {
  type CheckoutSaveContactFailure,
  type CheckoutSaveDeliveryDetailsFailure,
  CheckoutSession,
} from "@repo/commerce/lib/checkout/checkout-session";
import type { CurrentCartCookie } from "@repo/commerce/lib/current-cart/cookie";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Carts } from "@repo/commerce/services/carts";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { resolveStore } from "@repo/commerce/store";
import { Duration, Effect, Layer, Option, Ref, Schema } from "effect";
import {
  HttpEffect,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";
import {
  type CheckoutCustomerJwtInvalid,
  type CheckoutCustomerJwtVerificationFailure,
  CheckoutCustomerJwtVerifier,
} from "./customer-jwt";

type CheckoutRuntimeLayer = Layer.Layer<
  | CartPolicies
  | Carts
  | CheckoutPolicies
  | CommerceAccounts
  | CheckoutCustomerJwtVerifier,
  unknown,
  never
>;
type CheckoutAddressBookLayer = Layer.Layer<
  AddressBook,
  never,
  CommerceContext
>;
type CommerceRequestContextNotFoundReason = ConstructorParameters<
  typeof CommerceRequestContextNotFound
>[0]["reason"];
export interface CheckoutHttpDependencies {
  readonly layer: CheckoutRuntimeLayer;
  readonly addressBookLayer: CheckoutAddressBookLayer;
}

const getHeader = (
  headers: HttpServerRequest.HttpServerRequest["headers"],
  name: string
) => headers[name];

const checkoutContextNotFoundMessage =
  "Checkout was not found for the current request context";
const bearerTokenHeaderPattern = /^Bearer\s+(.+)$/i;

interface CheckoutDiagnosticFailure {
  readonly _tag: string;
  readonly message: string;
  readonly operation?: string;
}

const logCheckoutDiagnosticFailure = (error: CheckoutDiagnosticFailure) =>
  Effect.logError(error.message, error).pipe(
    Effect.annotateLogs({
      "checkout.error.tag": error._tag,
      ...(error.operation === undefined
        ? {}
        : { "checkout.operation": error.operation }),
    })
  );

const toCheckoutBadRequest = (
  locale?: string,
  code:
    | "checkout.addressBook.accessDenied"
    | "checkout.badRequest"
    | "checkout.deliveryDetails.addressBookEntryUnavailable"
    | "checkout.deliveryDetails.invalidInput"
    | "checkout.deliveryDetails.sourceUnavailable" = "checkout.badRequest",
  addressBookReference?: AddressBookReference
) =>
  new CheckoutApiBadRequest({
    code,
    message: checkoutApiErrorMessage(locale, code),
    ...(addressBookReference === undefined
      ? {}
      : { parameters: { addressBookReference } }),
  });

const getCheckoutRequestHeadersFromRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const locale = getHeader(request.headers, "x-context-locale");
  const anonymousCartId = getHeader(
    request.headers,
    "x-context-anonymous-cart-id"
  );
  const businessUnitId = getHeader(
    request.headers,
    "x-context-business-unit-id"
  );

  if (locale === undefined) {
    return yield* Effect.fail(toCheckoutBadRequest());
  }

  return yield* Schema.decodeUnknownEffect(CheckoutRequestHeaders)({
    "x-context-locale": locale,
    ...(anonymousCartId === undefined
      ? {}
      : { "x-context-anonymous-cart-id": anonymousCartId }),
    ...(businessUnitId === undefined
      ? {}
      : { "x-context-business-unit-id": businessUnitId }),
  }).pipe(Effect.mapError(() => toCheckoutBadRequest(locale)));
});

const toCheckoutNotFound = (locale: string) =>
  new CheckoutApiNotFound({
    code: "checkout.notFound",
    message: checkoutApiErrorMessage(locale, "checkout.notFound"),
  });

const toCheckoutApiError = (
  locale: string,
  code:
    | "checkout.addressBook.providerFailure"
    | "checkout.internal"
    | "checkout.deliveryDetails.providerFailure" = "checkout.internal",
  addressBookReference?: AddressBookReference
) =>
  new CheckoutApiError({
    code,
    message: checkoutApiErrorMessage(locale, code),
    ...(addressBookReference === undefined
      ? {}
      : { parameters: { addressBookReference } }),
  });

const commerceRequestContextNotFound = (
  reason: CommerceRequestContextNotFoundReason
) =>
  new CommerceRequestContextNotFound({
    message: checkoutContextNotFoundMessage,
    reason,
  });

const toCheckoutContextNotFound = (
  _error: CommerceRequestContextNotFound,
  locale: string
) => toCheckoutNotFound(locale);

const toCheckoutContextInternalError = (locale: string) =>
  toCheckoutApiError(locale);

const toCheckoutConflict = (
  locale: string,
  code: "checkout.cartMismatch" | "checkout.versionConflict",
  addressBookReference?: AddressBookReference
) =>
  new CheckoutApiConflict({
    code,
    message: checkoutApiErrorMessage(locale, code),
    ...(addressBookReference === undefined
      ? {}
      : { parameters: { addressBookReference } }),
  });

const toCheckoutContactHttpError = (
  error: CheckoutSaveContactFailure,
  locale: string
) => {
  switch (error._tag) {
    case "CheckoutUnavailable":
      return toCheckoutNotFound(locale);
    case "CheckoutMutationSchemaFailure":
    case "CheckoutMutationSourceUnavailable":
      return toCheckoutBadRequest(locale);
    case "CheckoutCartMismatch":
      return toCheckoutConflict(locale, "checkout.cartMismatch");
    case "CheckoutVersionConflict":
      return toCheckoutConflict(locale, "checkout.versionConflict");
    case "CheckoutMutationProviderFailure":
    case "CheckoutMutationUnsupported":
      return toCheckoutApiError(locale);
    default:
      error satisfies never;
      return toCheckoutApiError(locale);
  }
};

const toCheckoutDeliveryDetailsHttpError = (
  error: CheckoutSaveDeliveryDetailsFailure,
  locale: string
) => {
  switch (error._tag) {
    case "CheckoutUnavailable":
      return toCheckoutNotFound(locale);
    case "CheckoutMutationSchemaFailure":
      return toCheckoutBadRequest(
        locale,
        "checkout.deliveryDetails.invalidInput"
      );
    case "CheckoutMutationSourceUnavailable":
      return toCheckoutBadRequest(
        locale,
        "checkout.deliveryDetails.sourceUnavailable"
      );
    case "CheckoutMutationAddressBookEntryUnavailable":
      return toCheckoutBadRequest(
        locale,
        "checkout.deliveryDetails.addressBookEntryUnavailable",
        error.addressBookReference
      );
    case "CheckoutCartMismatch":
      return toCheckoutConflict(locale, "checkout.cartMismatch");
    case "CheckoutVersionConflict":
      return toCheckoutConflict(
        locale,
        "checkout.versionConflict",
        error.addressBookReference
      );
    case "CheckoutMutationProviderFailure":
      return toCheckoutApiError(
        locale,
        "checkout.deliveryDetails.providerFailure",
        error.addressBookReference
      );
    case "CheckoutMutationUnsupported":
      return toCheckoutApiError(locale);
    default:
      error satisfies never;
      return toCheckoutApiError(locale);
  }
};

const logUnexpectedCheckoutMutationFailure = (
  error: CheckoutSaveContactFailure | CheckoutSaveDeliveryDetailsFailure
) => {
  switch (error._tag) {
    case "CheckoutMutationProviderFailure":
    case "CheckoutMutationUnsupported":
      return logCheckoutDiagnosticFailure(error);
    default:
      return Effect.void;
  }
};

const parseBearerToken = (authorization: string | undefined) => {
  if (authorization === undefined) {
    return Effect.succeed(null);
  }

  const match = authorization.match(bearerTokenHeaderPattern);
  const token = match?.[1]?.trim();

  return token
    ? Effect.succeed(token)
    : Effect.fail(commerceRequestContextNotFound("noPrincipal"));
};

const toCheckoutContextAuthError = (
  locale: string,
  error: CheckoutCustomerJwtInvalid | CheckoutCustomerJwtVerificationFailure
) => {
  switch (error._tag) {
    case "CheckoutCustomerJwtInvalid":
      return commerceRequestContextNotFound("noPrincipal");
    case "CheckoutCustomerJwtVerificationFailure":
      return toCheckoutContextInternalError(locale);
    default:
      error satisfies never;
      return toCheckoutContextInternalError(locale);
  }
};

const getAuthUserIdFromAuthorization = (headers: CheckoutRequestHeaders) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const token = yield* parseBearerToken(
      getHeader(request.headers, "authorization")
    );

    if (token === null) {
      return null;
    }

    const locale = headers["x-context-locale"];
    const authUserId = yield* CheckoutCustomerJwtVerifier.verify(token).pipe(
      Effect.tapError((error) =>
        error._tag === "CheckoutCustomerJwtVerificationFailure"
          ? logCheckoutDiagnosticFailure(error)
          : Effect.void
      ),
      Effect.mapError((error) => toCheckoutContextAuthError(locale, error))
    );
    return authUserId;
  });

const anonymousCartCookieMaxAgeDays = 90;
const httpCurrentCartCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Duration.days(anonymousCartCookieMaxAgeDays),
};

type CartCookieChange =
  | { readonly _tag: "Set"; readonly value: string }
  | { readonly _tag: "Clear" };

interface HttpCurrentCartBoundary {
  readonly currentCartCookie: CurrentCartCookie;
  readonly commerceContextRequest: CommerceContextRequest;
}

const makeHttpCurrentCartBoundary = (
  headers: CheckoutRequestHeaders,
  authUserId: AuthUserId | null
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const locale = headers["x-context-locale"];
    const store = resolveStore({ locale });

    if (authUserId !== null) {
      return {
        currentCartCookie: {
          set: () => Effect.void,
          clear: () => Effect.void,
        },
        commerceContextRequest: new CustomerCommerceContextRequest({
          store,
          authUserId,
          ...(headers["x-context-business-unit-id"] === undefined
            ? {}
            : {
                businessUnitId: headers["x-context-business-unit-id"],
              }),
        }),
      } satisfies HttpCurrentCartBoundary;
    }

    const cartCookieChange = yield* Ref.make(Option.none<CartCookieChange>());
    HttpEffect.appendPreResponseHandlerUnsafe(
      request,
      (
        _request: HttpServerRequest.HttpServerRequest,
        response: HttpServerResponse.HttpServerResponse
      ) =>
        Ref.get(cartCookieChange).pipe(
          Effect.map(
            Option.match({
              onNone: () => response,
              onSome: (change) =>
                change._tag === "Set"
                  ? HttpServerResponse.setCookieUnsafe(
                      response,
                      ANONYMOUS_CART_COOKIE_NAME,
                      change.value,
                      httpCurrentCartCookieOptions
                    )
                  : HttpServerResponse.expireCookieUnsafe(
                      response,
                      ANONYMOUS_CART_COOKIE_NAME,
                      { path: "/" }
                    ),
            })
          )
        )
    );

    const cookieCartId = getAnonymousCartIdFromCookieValue(
      request.cookies[ANONYMOUS_CART_COOKIE_NAME],
      store
    );
    const anonymousCartId =
      cookieCartId === null
        ? headers["x-context-anonymous-cart-id"]
        : CartId.make(cookieCartId);
    return {
      currentCartCookie: {
        set: (cartId: CartId) =>
          Effect.try({
            try: () =>
              encodeAnonymousCartCookie(
                makeAnonymousCartCookie({ cartId, store })
              ),
            catch: currentCartOperationFailure,
          }).pipe(
            Effect.flatMap((value) =>
              Ref.set(cartCookieChange, Option.some({ _tag: "Set", value }))
            )
          ),
        clear: () => Ref.set(cartCookieChange, Option.some({ _tag: "Clear" })),
      },
      commerceContextRequest: new AnonymousCommerceContextRequest({
        store,
        ...(anonymousCartId === undefined ? {} : { anonymousCartId }),
      }),
    } satisfies HttpCurrentCartBoundary;
  });

const checkoutSessionMiddlewareLayer = (
  addressBookLayer: CheckoutAddressBookLayer
) =>
  Layer.effect(
    CheckoutSessionMiddleware,
    Effect.gen(function* () {
      const carts = yield* Carts;
      const cartPolicies = yield* CartPolicies;
      const checkoutPolicies = yield* CheckoutPolicies;
      const commerceAccounts = yield* CommerceAccounts;
      const checkoutCustomerJwtVerifier = yield* CheckoutCustomerJwtVerifier;
      const currentCartDependencies = Layer.merge(
        Layer.succeed(Carts, carts),
        Layer.succeed(CartPolicies, cartPolicies)
      );
      const checkoutPoliciesLayer = Layer.succeed(
        CheckoutPolicies,
        checkoutPolicies
      );
      const commerceAccountsLayer = Layer.succeed(
        CommerceAccounts,
        commerceAccounts
      );
      const authenticationLayer = Layer.succeed(
        CheckoutCustomerJwtVerifier,
        checkoutCustomerJwtVerifier
      );

      return (httpEffect) =>
        Effect.gen(function* () {
          const headers = yield* getCheckoutRequestHeadersFromRequest;
          const locale = headers["x-context-locale"];
          const authUserId = yield* getAuthUserIdFromAuthorization(
            headers
          ).pipe(
            Effect.provide(authenticationLayer),
            Effect.mapError((error) =>
              error._tag === "CommerceRequestContextNotFound"
                ? toCheckoutContextNotFound(error, locale)
                : error
            )
          );
          const boundary = yield* makeHttpCurrentCartBoundary(
            headers,
            authUserId
          );
          const commerceContext = CommerceContext.layer(
            boundary.commerceContextRequest
          ).pipe(Layer.provide(commerceAccountsLayer));
          const currentCart = CurrentCart.layer(
            boundary.currentCartCookie
          ).pipe(
            Layer.provide(Layer.merge(currentCartDependencies, commerceContext))
          );
          const addressBook = addressBookLayer.pipe(
            Layer.provide(commerceContext)
          );
          const checkoutSession = CheckoutSession.layer.pipe(
            Layer.provide(
              Layer.mergeAll(
                checkoutPoliciesLayer,
                commerceContext,
                currentCart,
                addressBook
              )
            )
          );
          const requestServices = Layer.merge(addressBook, checkoutSession);
          return yield* httpEffect.pipe(
            Effect.provide(requestServices),
            Effect.catchTags({
              CommerceRequestContextNotFound: (error) =>
                Effect.fail(toCheckoutContextNotFound(error, locale)),
              CommerceAccountError: (error) =>
                logCheckoutDiagnosticFailure(error).pipe(
                  Effect.andThen(
                    Effect.fail(toCheckoutContextInternalError(locale))
                  )
                ),
            })
          );
        });
    })
  );

const checkoutSchemaErrorMiddlewareLayer =
  HttpApiMiddleware.layerSchemaErrorTransform(
    CheckoutSchemaErrorMiddleware,
    () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const locale = getHeader(request.headers, "x-context-locale");
        return yield* Effect.fail(toCheckoutBadRequest(locale));
      })
  );

const makeCheckoutHttpHandlers = () =>
  HttpApiBuilder.group(
    CheckoutHttpApi,
    "checkout",
    Effect.fn(function* (handlers) {
      return handlers
        .handle("addressBook", ({ headers }) =>
          AddressBook.list().pipe(
            Effect.tapError((error) =>
              error._tag === "AddressBookProviderFailure"
                ? logCheckoutDiagnosticFailure(error)
                : Effect.void
            ),
            Effect.mapError((error) => {
              switch (error._tag) {
                case "CommerceRequestContextNotFound":
                  return toCheckoutContextNotFound(
                    error,
                    headers["x-context-locale"]
                  );
                case "AddressBookAccessDenied":
                  return toCheckoutBadRequest(
                    headers["x-context-locale"],
                    "checkout.addressBook.accessDenied"
                  );
                case "AddressBookProviderFailure":
                  return toCheckoutApiError(
                    headers["x-context-locale"],
                    "checkout.addressBook.providerFailure"
                  );
                default:
                  error satisfies never;
                  return toCheckoutApiError(headers["x-context-locale"]);
              }
            })
          )
        )
        .handle("current", ({ headers }) =>
          CheckoutSession.getCurrent().pipe(
            Effect.map(toCheckoutApiState),
            Effect.tapError((error) =>
              error._tag === "CheckoutProviderFailure"
                ? logCheckoutDiagnosticFailure(error)
                : Effect.void
            ),
            Effect.mapError((error) => {
              switch (error._tag) {
                case "CheckoutUnavailable":
                  return toCheckoutNotFound(headers["x-context-locale"]);
                default:
                  return toCheckoutApiError(headers["x-context-locale"]);
              }
            })
          )
        )
        .handle("saveContact", ({ headers, payload }) =>
          CheckoutSession.saveContact({
            cart: payload.cart,
            contact: payload.contact,
          }).pipe(
            Effect.tapError(logUnexpectedCheckoutMutationFailure),
            Effect.map(toCheckoutApiState),
            Effect.mapError((error) =>
              toCheckoutContactHttpError(error, headers["x-context-locale"])
            )
          )
        )
        .handle("saveDeliveryDetails", ({ headers, payload }) =>
          CheckoutSession.saveDeliveryDetails({
            cart: payload.cart,
            deliveryDetails: payload.deliveryDetails,
          }).pipe(
            Effect.tapError(logUnexpectedCheckoutMutationFailure),
            Effect.map((result) => toCheckoutApiState(result.state)),
            Effect.mapError((error) =>
              toCheckoutDeliveryDetailsHttpError(
                error,
                headers["x-context-locale"]
              )
            )
          )
        );
    })
  );

const makeCheckoutHttpApiLayer = (dependencies: CheckoutHttpDependencies) =>
  HttpApiBuilder.layer(CheckoutHttpApi, {
    openapiPath: "/openapi.json",
  }).pipe(
    Layer.provide(makeCheckoutHttpHandlers()),
    Layer.provide(checkoutSchemaErrorMiddlewareLayer),
    Layer.provide(
      checkoutSessionMiddlewareLayer(dependencies.addressBookLayer)
    ),
    Layer.provideMerge(dependencies.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeCheckoutHttpHandler = (
  dependencies: CheckoutHttpDependencies
) =>
  HttpRouter.toWebHandler(makeCheckoutHttpApiLayer(dependencies), {
    disableLogger: true,
  });
