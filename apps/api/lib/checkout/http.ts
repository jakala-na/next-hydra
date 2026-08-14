import type { AddressBookReference } from "@repo/commerce/domain/address-book";
import { CartId } from "@repo/commerce/domain/cart";
import { currentCartOperationFailure } from "@repo/commerce/domain/cart-errors";
import {
  AnonymousCommerceContextRequest,
  type AuthUserId,
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
import {
  type CheckoutSaveContactFailure,
  type CheckoutSaveDeliveryDetailsFailure,
  CheckoutSession,
} from "@repo/commerce/lib/checkout/checkout-session";
import type { CommerceRequestInput } from "@repo/commerce/runtime/commerce-request";
import type {
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceStableServices,
} from "@repo/commerce/runtime/make-commerce-app";
import { AddressBook } from "@repo/commerce/services/address-book";
import { resolveStore } from "@repo/commerce/store";
import {
  type Config,
  Duration,
  Effect,
  Layer,
  Option,
  Ref,
  Schema,
} from "effect";
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

type CheckoutCommerceApp = CommerceApplication<
  Config.ConfigError,
  Config.ConfigError | CommerceRequestProvisionError
>;
type CheckoutAuthenticationLayer = Layer.Layer<
  CheckoutCustomerJwtVerifier,
  Config.ConfigError
>;
type CommerceRequestContextNotFoundReason = ConstructorParameters<
  typeof CommerceRequestContextNotFound
>[0]["reason"];
export interface CheckoutHttpDependencies {
  readonly authenticationLayer: CheckoutAuthenticationLayer;
  readonly commerceApp: CheckoutCommerceApp;
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

const exhaustive = (_value: never): undefined => undefined;

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
      exhaustive(error);
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
      exhaustive(error);
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
      exhaustive(error);
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
  maxAge: Duration.days(anonymousCartCookieMaxAgeDays),
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

type CartCookieChange =
  | { readonly _tag: "Set"; readonly value: string }
  | { readonly _tag: "Clear" };

const makeHttpCommerceRequest = (
  headers: CheckoutRequestHeaders,
  authUserId: AuthUserId | null
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const locale = headers["x-context-locale"];
    const store = resolveStore({ locale });

    if (authUserId !== null) {
      return {
        context: new CustomerCommerceContextRequest({
          authUserId,
          store,
          ...(headers["x-context-business-unit-id"] === undefined
            ? {}
            : {
                businessUnitId: headers["x-context-business-unit-id"],
              }),
        }),
        currentCartCookie: {
          clear: () => Effect.void,
          set: () => Effect.void,
        },
      } satisfies CommerceRequestInput;
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
      context: new AnonymousCommerceContextRequest({
        store,
        ...(anonymousCartId === undefined ? {} : { anonymousCartId }),
      }),
      currentCartCookie: {
        clear: () => Ref.set(cartCookieChange, Option.some({ _tag: "Clear" })),
        set: (cartId: CartId) =>
          Effect.try({
            catch: currentCartOperationFailure,
            try: () =>
              encodeAnonymousCartCookie(
                makeAnonymousCartCookie({ cartId, store })
              ),
          }).pipe(
            Effect.flatMap((value) =>
              Ref.set(cartCookieChange, Option.some({ _tag: "Set", value }))
            )
          ),
      },
    } satisfies CommerceRequestInput;
  });

const checkoutSessionMiddlewareLayer = (commerceApp: CheckoutCommerceApp) =>
  Layer.effect(
    CheckoutSessionMiddleware,
    Effect.gen(function* () {
      const checkoutCustomerJwtVerifier = yield* CheckoutCustomerJwtVerifier;
      const commerceServices = yield* Effect.context<CommerceStableServices>();
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
          const request = yield* makeHttpCommerceRequest(headers, authUserId);
          return yield* httpEffect.pipe(
            commerceApp.provide(request),
            Effect.provide(commerceServices),
            Effect.catchTags({
              CommerceAccountError: (error) =>
                logCheckoutDiagnosticFailure(error).pipe(
                  Effect.andThen(
                    Effect.fail(toCheckoutContextInternalError(locale))
                  )
                ),
              CommerceRequestContextNotFound: (error) =>
                Effect.fail(toCheckoutContextNotFound(error, locale)),
              ConfigError: (error) =>
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
                  exhaustive(error);
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
    Layer.provide(checkoutSessionMiddlewareLayer(dependencies.commerceApp)),
    Layer.provideMerge(dependencies.authenticationLayer),
    Layer.provideMerge(dependencies.commerceApp.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeCheckoutHttpHandler = (
  dependencies: CheckoutHttpDependencies
) =>
  HttpRouter.toWebHandler(makeCheckoutHttpApiLayer(dependencies), {
    disableLogger: true,
  });
