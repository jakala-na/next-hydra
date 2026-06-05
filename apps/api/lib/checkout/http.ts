import { StorefrontAnonymousCheckoutScope } from "@repo/commerce/domain/checkout";
import {
  AnonymousCommercePrincipal,
  CommerceRequestContext,
  CommerceRequestContextNotFound,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import {
  CheckoutApiBadRequest,
  CheckoutApiError,
  CheckoutApiNotFound,
  CheckoutHttpApi,
  CheckoutRequestHeaders,
  CheckoutScopeMiddleware,
  CurrentCheckoutScope,
} from "@repo/commerce/http/checkout-api";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  getAnonymousCartCookieContextByLocale,
  getAnonymousCartIdFromCookieValue,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import {
  CheckoutSession,
  type CheckoutSession as CheckoutSessionService,
} from "@repo/commerce/lib/checkout/checkout-session";
import { toCheckoutScope } from "@repo/commerce/lib/checkout/request-context";
import {
  type CommerceAccountError,
  CommerceAccounts,
  type CommerceCustomerIdNotFound,
} from "@repo/commerce/services/commerce-accounts";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  type CheckoutCustomerJwtInvalid,
  type CheckoutCustomerJwtVerificationFailure,
  CheckoutCustomerJwtVerifier,
} from "./customer-jwt";

type CheckoutRuntimeLayer = Layer.Layer<
  CheckoutSessionService | CommerceAccounts | CheckoutCustomerJwtVerifier,
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

const getCheckoutRequestHeadersFromRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const locale = getHeader(request.headers, "x-context-locale");
  const headerAnonymousCartId = getHeader(
    request.headers,
    "x-context-anonymous-cart-id"
  );

  if (locale === undefined) {
    return yield* Effect.fail(
      new CheckoutApiBadRequest({
        code: "checkout.badRequest",
        message: "Missing x-context-locale header",
      })
    );
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
  }).pipe(
    Effect.mapError(
      () =>
        new CheckoutApiBadRequest({
          code: "checkout.badRequest",
          message: "Invalid checkout headers",
        })
    )
  );
});

const toCheckoutNotFound = (message: string) =>
  new CheckoutApiNotFound({
    code: "checkout.notFound",
    message,
  });

const toCheckoutApiError = (message: string) =>
  new CheckoutApiError({
    code: "checkout.internal",
    message,
  });

const commerceRequestContextNotFound = (
  reason: CommerceRequestContextNotFoundReason
) =>
  new CommerceRequestContextNotFound({
    message: checkoutContextNotFoundMessage,
    reason,
  });

const toCheckoutContextNotFound = (error: CommerceRequestContextNotFound) =>
  toCheckoutNotFound(error.message);

const toCheckoutContextInternalError = () =>
  toCheckoutApiError("Failed to resolve checkout request context");

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
  error: CheckoutCustomerJwtInvalid | CheckoutCustomerJwtVerificationFailure
) => {
  switch (error._tag) {
    case "CheckoutCustomerJwtInvalid":
      return commerceRequestContextNotFound("noPrincipal");
    case "CheckoutCustomerJwtVerificationFailure":
      return toCheckoutContextInternalError();
    default:
      error satisfies never;
      return toCheckoutContextInternalError();
  }
};

const toCheckoutContextAccountError = (
  error: CommerceCustomerIdNotFound | CommerceAccountError
) => {
  switch (error._tag) {
    case "CommerceCustomerIdNotFound":
      return commerceRequestContextNotFound("noCustomerMapping");
    case "CommerceAccountError":
      return toCheckoutContextInternalError();
    default:
      error satisfies never;
      return toCheckoutContextInternalError();
  }
};

const resolveCustomerCheckoutScopeFromAuthorization = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const token = yield* parseBearerToken(
    getHeader(request.headers, "authorization")
  );

  if (token === null) {
    return null;
  }

  const headers = yield* getCheckoutRequestHeadersFromRequest;
  const authUserId = yield* CheckoutCustomerJwtVerifier.verify(token).pipe(
    Effect.mapError(toCheckoutContextAuthError)
  );
  const commerceAccounts = yield* CommerceAccounts;
  const customerId = yield* commerceAccounts
    .getCustomerIdByAuthUserId(authUserId)
    .pipe(Effect.mapError(toCheckoutContextAccountError));

  return toCheckoutScope(
    new CommerceRequestContext({
      locale: headers["x-context-locale"],
      principal: new CustomerCommercePrincipal({
        authUserId,
        customerId,
      }),
    })
  );
});

const getCurrentCheckoutScope = Effect.gen(function* () {
  const customerScope = yield* resolveCustomerCheckoutScopeFromAuthorization;

  if (customerScope) {
    return customerScope;
  }

  return yield* CurrentCheckoutScope.pipe(
    Effect.flatMap(failWhenAnonymousScopeHasNoCart)
  );
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

const makeCheckoutHttpHandlers = () =>
  HttpApiBuilder.group(
    CheckoutHttpApi,
    "checkout",
    Effect.fn(function* (handlers) {
      return handlers.handle("current", () =>
        Effect.gen(function* () {
          const scope = yield* getCurrentCheckoutScope;
          return yield* CheckoutSession.getCurrent(scope);
        }).pipe(
          Effect.mapError((error) => {
            switch (error._tag) {
              case "CommerceRequestContextNotFound":
                return toCheckoutContextNotFound(error);
              case "CheckoutApiBadRequest":
              case "CheckoutApiError":
                return error;
              case "CheckoutUnavailable":
                return toCheckoutNotFound(error.message);
              default:
                return toCheckoutApiError(error.message);
            }
          })
        )
      );
    })
  );

const makeCheckoutHttpApiLayer = (dependencies: CheckoutHttpDependencies) =>
  HttpApiBuilder.layer(CheckoutHttpApi, {
    openapiPath: "/openapi.json",
  }).pipe(
    Layer.provide(makeCheckoutHttpHandlers()),
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
