import type { AddressBookReference } from "@repo/commerce/domain/address-book";
import { type CartId, StoreKey } from "@repo/commerce/domain/cart";
import { CurrentCartAssociationFailure } from "@repo/commerce/domain/cart-errors";
import { CartStore } from "@repo/commerce/domain/cart-snapshot";
import { StorefrontAnonymousCheckoutScope } from "@repo/commerce/domain/checkout";
import {
  AnonymousCommercePrincipal,
  CommerceRequestContext,
  CommerceRequestContextNotFound,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import {
  CheckoutApiBadRequest,
  CheckoutApiConflict,
  CheckoutApiError,
  CheckoutApiNotFound,
  CheckoutHttpApi,
  CheckoutRequestHeaders,
  CheckoutSchemaErrorMiddleware,
  CheckoutScopeMiddleware,
  CurrentCheckoutScope,
} from "@repo/commerce/http/checkout-api";
import { checkoutApiErrorMessage } from "@repo/commerce/http/checkout-api-messages";
import { toCheckoutApiState } from "@repo/commerce/http/checkout-api-state";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  getAnonymousCartCookieContextByLocale,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import {
  type CheckoutSaveContactFailure,
  type CheckoutSaveDeliveryDetailsFailure,
  CheckoutSession,
  type CheckoutSession as CheckoutSessionService,
} from "@repo/commerce/lib/checkout/checkout-session";
import { toCheckoutScope } from "@repo/commerce/lib/checkout/request-context";
import type { CurrentCartRequest } from "@repo/commerce/lib/current-cart/request";
import { getStoreKeyByLocale } from "@repo/commerce/lib/store/utils/mappings";
import { AddressBook } from "@repo/commerce/services/address-book";
import {
  type CommerceAccountError,
  CommerceAccounts,
  type CommerceBusinessUnitContextAmbiguous,
  type CommerceBusinessUnitContextNotFound,
  type CommerceCustomerIdNotFound,
} from "@repo/commerce/services/commerce-accounts";
import type { Locale } from "@repo/i18n/types";
import { Duration, Effect, Layer, Schema } from "effect";
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
  | AddressBook
  | CheckoutSessionService
  | CommerceAccounts
  | CheckoutCustomerJwtVerifier,
  unknown,
  never
>;
type CommerceRequestContextNotFoundReason = ConstructorParameters<
  typeof CommerceRequestContextNotFound
>[0]["reason"];

export interface CheckoutHttpDependencies {
  readonly layer: CheckoutRuntimeLayer;
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
  const headerAnonymousCartId = getHeader(
    request.headers,
    "x-context-anonymous-cart-id"
  );

  if (locale === undefined) {
    return yield* Effect.fail(toCheckoutBadRequest());
  }

  const cookieAnonymousCartId = getAnonymousCartIdFromCookieValue(
    request.cookies[ANONYMOUS_CART_COOKIE_NAME],
    getAnonymousCartCookieContextByLocale(locale as Locale)
  );
  const anonymousCartId = cookieAnonymousCartId ?? headerAnonymousCartId;

  return yield* Schema.decodeUnknownEffect(CheckoutRequestHeaders)({
    "x-context-locale": locale,
    ...(anonymousCartId === undefined
      ? {}
      : { "x-context-anonymous-cart-id": anonymousCartId }),
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

const resolveCheckoutScope = (headers: CheckoutRequestHeaders) => {
  const anonymousCartId = headers["x-context-anonymous-cart-id"];

  if (anonymousCartId === undefined) {
    return new StorefrontAnonymousCheckoutScope({
      channel: "storefrontAnonymous",
      locale: headers["x-context-locale"],
    });
  }

  return toCheckoutScope(
    new CommerceRequestContext({
      locale: headers["x-context-locale"],
      principal: new AnonymousCommercePrincipal({
        anonymousCartId,
      }),
    })
  );
};

const failWhenAnonymousScopeHasNoCart = (
  scope: Parameters<typeof CheckoutSession.getCurrent>[0]
) => {
  if (scope.channel === "storefrontAnonymous" && !scope.anonymousCartId) {
    return Effect.fail(commerceRequestContextNotFound("noPrincipal"));
  }

  return Effect.succeed(scope);
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

const toCheckoutContextAccountError = (
  locale: string,
  error:
    | CommerceCustomerIdNotFound
    | CommerceBusinessUnitContextNotFound
    | CommerceBusinessUnitContextAmbiguous
    | CommerceAccountError
) => {
  switch (error._tag) {
    case "CommerceCustomerIdNotFound":
      return commerceRequestContextNotFound("noCustomerMapping");
    case "CommerceBusinessUnitContextNotFound":
    case "CommerceBusinessUnitContextAmbiguous":
      return commerceRequestContextNotFound("noBuyingContext");
    case "CommerceAccountError":
      return toCheckoutContextInternalError(locale);
    default:
      error satisfies never;
      return toCheckoutContextInternalError(locale);
  }
};

const resolveCustomerCheckoutContextFromAuthorization = Effect.gen(
  function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const token = yield* parseBearerToken(
      getHeader(request.headers, "authorization")
    );

    if (token === null) {
      return null;
    }

    const headers = yield* getCheckoutRequestHeadersFromRequest;
    const locale = headers["x-context-locale"];
    const authUserId = yield* CheckoutCustomerJwtVerifier.verify(token).pipe(
      Effect.tapError((error) =>
        error._tag === "CheckoutCustomerJwtVerificationFailure"
          ? logCheckoutDiagnosticFailure(error)
          : Effect.void
      ),
      Effect.mapError((error) => toCheckoutContextAuthError(locale, error))
    );
    const commerceAccounts = yield* CommerceAccounts;
    const customerId = yield* commerceAccounts
      .getCustomerIdByAuthUserId(authUserId)
      .pipe(
        Effect.tapError((error) =>
          error._tag === "CommerceAccountError"
            ? logCheckoutDiagnosticFailure(error)
            : Effect.void
        ),
        Effect.mapError((error) => toCheckoutContextAccountError(locale, error))
      );
    const storeKey = StoreKey.make(getStoreKeyByLocale(locale as Locale));
    const businessUnitContext = yield* commerceAccounts
      .getBusinessUnitContextForCustomerInStore(customerId, storeKey)
      .pipe(
        Effect.tapError((error) =>
          error._tag === "CommerceAccountError"
            ? logCheckoutDiagnosticFailure(error)
            : Effect.void
        ),
        Effect.mapError((error) => toCheckoutContextAccountError(locale, error))
      );

    return new CommerceRequestContext({
      locale: headers["x-context-locale"],
      principal: new CustomerCommercePrincipal({
        authUserId,
        customerId,
        businessUnitId: businessUnitContext.businessUnitId,
        businessUnitKey: businessUnitContext.businessUnitKey,
      }),
    });
  }
);

const anonymousCartCookieMaxAgeDays = 90;
const httpCurrentCartCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Duration.days(anonymousCartCookieMaxAgeDays),
};

const currentCartAssociationFailure = (
  operation: "establish" | "clear",
  cause: unknown
) => new CurrentCartAssociationFailure({ operation, cause });

export const resolveHttpCurrentCartRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const headers = yield* getCheckoutRequestHeadersFromRequest;
  const locale = headers["x-context-locale"];
  const cookieContext = getAnonymousCartCookieContextByLocale(locale);
  const store = new CartStore({
    locale,
    storeKey: StoreKey.make(cookieContext.storeKey),
    currency: cookieContext.currency,
  });
  const customerContext =
    yield* resolveCustomerCheckoutContextFromAuthorization;

  if (customerContext !== null) {
    const principal = customerContext.principal;
    if (!(principal instanceof CustomerCommercePrincipal)) {
      return yield* commerceRequestContextNotFound("noPrincipal");
    }
    return {
      _tag: "BusinessUnitCurrentCartRequest",
      store,
      customerId: principal.customerId,
      businessUnitId: principal.businessUnitId,
      businessUnitKey: principal.businessUnitKey,
    } satisfies CurrentCartRequest;
  }

  const possessedCartId = headers["x-context-anonymous-cart-id"];
  return {
    _tag: "AnonymousCurrentCartRequest",
    store,
    ...(possessedCartId === undefined ? {} : { possessedCartId }),
    establish: (cartId: CartId) =>
      Effect.try({
        try: () => {
          const value = encodeAnonymousCartCookie(
            makeAnonymousCartCookie({ cartId, context: cookieContext })
          );
          HttpEffect.appendPreResponseHandlerUnsafe(
            request,
            (_request, response) =>
              Effect.succeed(
                HttpServerResponse.setCookieUnsafe(
                  response,
                  ANONYMOUS_CART_COOKIE_NAME,
                  value,
                  httpCurrentCartCookieOptions
                )
              )
          );
        },
        catch: (cause) => currentCartAssociationFailure("establish", cause),
      }),
    clear: () =>
      Effect.sync(() =>
        HttpEffect.appendPreResponseHandlerUnsafe(
          request,
          (_request, response) =>
            Effect.succeed(
              HttpServerResponse.expireCookieUnsafe(
                response,
                ANONYMOUS_CART_COOKIE_NAME,
                { path: "/" }
              )
            )
        )
      ),
  } satisfies CurrentCartRequest;
});

const getCurrentCheckoutContext = Effect.gen(function* () {
  const customerContext =
    yield* resolveCustomerCheckoutContextFromAuthorization;

  if (customerContext) {
    return customerContext;
  }

  const scope = yield* CurrentCheckoutScope.pipe(
    Effect.flatMap(failWhenAnonymousScopeHasNoCart)
  );

  if (scope.channel !== "storefrontAnonymous" || !scope.anonymousCartId) {
    return yield* commerceRequestContextNotFound("noPrincipal");
  }

  return new CommerceRequestContext({
    locale: scope.locale,
    principal: new AnonymousCommercePrincipal({
      anonymousCartId: scope.anonymousCartId,
    }),
  });
});

const getCurrentCheckoutScope = Effect.gen(function* () {
  return toCheckoutScope(yield* getCurrentCheckoutContext);
});

const checkoutScopeMiddlewareLayer = Layer.succeed(
  CheckoutScopeMiddleware,
  (httpEffect) =>
    Effect.gen(function* () {
      const headers = yield* getCheckoutRequestHeadersFromRequest;
      return yield* Effect.provideService(
        httpEffect,
        CurrentCheckoutScope,
        resolveCheckoutScope(headers)
      );
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
        .handle("addressBook", () =>
          Effect.flatMap(CurrentCheckoutScope, (requestScope) =>
            Effect.gen(function* () {
              const context = yield* getCurrentCheckoutContext;

              if (!(context.principal instanceof CustomerCommercePrincipal)) {
                return yield* commerceRequestContextNotFound("noPrincipal");
              }

              const addressBook = yield* AddressBook;
              return yield* addressBook.list(context.principal).pipe(
                Effect.tapError((error) =>
                  error._tag === "AddressBookProviderFailure"
                    ? logCheckoutDiagnosticFailure(error)
                    : Effect.void
                ),
                Effect.mapError((error) =>
                  error._tag === "AddressBookAccessDenied"
                    ? toCheckoutBadRequest(
                        requestScope.locale,
                        "checkout.addressBook.accessDenied"
                      )
                    : toCheckoutApiError(
                        requestScope.locale,
                        "checkout.addressBook.providerFailure"
                      )
                )
              );
            }).pipe(
              Effect.mapError((error) => {
                switch (error._tag) {
                  case "CommerceRequestContextNotFound":
                    return toCheckoutContextNotFound(
                      error,
                      requestScope.locale
                    );
                  case "CheckoutApiBadRequest":
                  case "CheckoutApiError":
                    return error;
                  default:
                    return toCheckoutApiError(requestScope.locale);
                }
              })
            )
          )
        )
        .handle("current", () =>
          Effect.flatMap(CurrentCheckoutScope, (requestScope) =>
            Effect.gen(function* () {
              const scope = yield* getCurrentCheckoutScope;
              return yield* CheckoutSession.getCurrent(scope).pipe(
                Effect.map(toCheckoutApiState)
              );
            }).pipe(
              Effect.tapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? logCheckoutDiagnosticFailure(error)
                  : Effect.void
              ),
              Effect.mapError((error) => {
                switch (error._tag) {
                  case "CommerceRequestContextNotFound":
                    return toCheckoutContextNotFound(
                      error,
                      requestScope.locale
                    );
                  case "CheckoutApiBadRequest":
                  case "CheckoutApiError":
                    return error;
                  case "CheckoutUnavailable":
                    return toCheckoutNotFound(requestScope.locale);
                  default:
                    return toCheckoutApiError(requestScope.locale);
                }
              })
            )
          )
        )
        .handle("saveContact", ({ payload }) =>
          Effect.flatMap(CurrentCheckoutScope, (requestScope) =>
            Effect.gen(function* () {
              const scope = yield* getCurrentCheckoutScope;
              yield* CheckoutSession.saveContact({
                scope,
                cart: payload.cart,
                contact: payload.contact,
              }).pipe(
                Effect.tapError(logUnexpectedCheckoutMutationFailure),
                Effect.mapError((error) =>
                  toCheckoutContactHttpError(error, requestScope.locale)
                )
              );

              return yield* CheckoutSession.getCurrent(scope).pipe(
                Effect.tapError((error) =>
                  error._tag === "CheckoutProviderFailure"
                    ? logCheckoutDiagnosticFailure(error)
                    : Effect.void
                ),
                Effect.map(toCheckoutApiState)
              );
            }).pipe(
              Effect.mapError((error) => {
                switch (error._tag) {
                  case "CommerceRequestContextNotFound":
                    return toCheckoutContextNotFound(
                      error,
                      requestScope.locale
                    );
                  case "CheckoutApiBadRequest":
                  case "CheckoutApiConflict":
                  case "CheckoutApiError":
                  case "CheckoutApiNotFound":
                    return error;
                  case "CheckoutUnavailable":
                    return toCheckoutNotFound(requestScope.locale);
                  default:
                    return toCheckoutApiError(requestScope.locale);
                }
              })
            )
          )
        )
        .handle("saveDeliveryDetails", ({ payload }) =>
          Effect.flatMap(CurrentCheckoutScope, (requestScope) =>
            Effect.gen(function* () {
              const context = yield* getCurrentCheckoutContext;
              const scope = toCheckoutScope(context);
              const mutationResult = yield* CheckoutSession.saveDeliveryDetails(
                {
                  context,
                  cart: payload.cart,
                  deliveryDetails: payload.deliveryDetails,
                }
              ).pipe(
                Effect.tapError(logUnexpectedCheckoutMutationFailure),
                Effect.mapError((error) =>
                  toCheckoutDeliveryDetailsHttpError(error, requestScope.locale)
                )
              );

              return yield* CheckoutSession.getCurrent(scope).pipe(
                Effect.tapError((error) =>
                  error._tag === "CheckoutProviderFailure"
                    ? logCheckoutDiagnosticFailure(error)
                    : Effect.void
                ),
                Effect.map(toCheckoutApiState),
                Effect.mapError((error) =>
                  error._tag === "CheckoutProviderFailure"
                    ? toCheckoutApiError(
                        requestScope.locale,
                        "checkout.deliveryDetails.providerFailure",
                        mutationResult.addressBookReference
                      )
                    : error
                )
              );
            }).pipe(
              Effect.mapError((error) => {
                switch (error._tag) {
                  case "CommerceRequestContextNotFound":
                    return toCheckoutContextNotFound(
                      error,
                      requestScope.locale
                    );
                  case "CheckoutApiBadRequest":
                  case "CheckoutApiConflict":
                  case "CheckoutApiError":
                  case "CheckoutApiNotFound":
                    return error;
                  case "CheckoutUnavailable":
                    return toCheckoutNotFound(requestScope.locale);
                  default:
                    return toCheckoutApiError(requestScope.locale);
                }
              })
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
    Layer.provide(checkoutScopeMiddlewareLayer),
    Layer.provideMerge(dependencies.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeCheckoutHttpHandler = (
  dependencies: CheckoutHttpDependencies
) =>
  HttpRouter.toWebHandler(makeCheckoutHttpApiLayer(dependencies), {
    disableLogger: true,
  });
