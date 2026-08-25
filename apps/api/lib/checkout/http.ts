import { AccessTokenVerifier } from "@repo/auth/access-token";
import type {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  VerifiedAccessToken,
} from "@repo/auth/access-token";
import {
  makeCheckoutAuthenticationUnavailable,
  makeCheckoutUnauthenticated,
  projectCheckoutReadFailure,
  projectCheckoutRequestFailure,
  projectSaveCheckoutContactFailure,
  projectSaveCheckoutDeliveryDetailsFailure,
} from "@repo/commerce/checkout/public-errors";
import { CartId } from "@repo/commerce/domain/cart";
import { currentCartOperationFailure } from "@repo/commerce/domain/cart-errors";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  CheckoutHttpApi,
  CheckoutSchemaErrorMiddleware,
  CheckoutSessionMiddleware,
} from "@repo/commerce/http/checkout-api";
import { checkoutApiErrorMessage } from "@repo/commerce/http/checkout-api-messages";
import { toCheckoutApiState } from "@repo/commerce/http/checkout-api-state";
import { CommerceRequestHeaders } from "@repo/commerce/http/commerce-request";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import type { CommerceRequestInput } from "@repo/commerce/runtime/commerce-request";
import type {
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceStableServices,
} from "@repo/commerce/runtime/make-commerce-app";
import { resolveStore } from "@repo/commerce/store";
import {
  ErrorIssue,
  makeInputInvalid,
  makeSchemaErrorIssues,
} from "@repo/errors";
import { unexpectedHttpErrorsLayer } from "@repo/errors/http";
import { Duration, Effect, Layer, Option, Ref, Schema } from "effect";
import type { Config, Redacted } from "effect";
import {
  HttpEffect,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";

import { parseBearerAuthorization } from "../auth/bearer-token";

type CheckoutCommerceApp = CommerceApplication<
  Config.ConfigError,
  Config.ConfigError | CommerceRequestProvisionError
>;
type CheckoutAuthenticationLayer = Layer.Layer<
  AccessTokenVerifier,
  Config.ConfigError
>;
export interface CheckoutHttpDependencies {
  readonly authenticationLayer: CheckoutAuthenticationLayer;
  readonly commerceApp: CheckoutCommerceApp;
}

const getHeader = (
  headers: HttpServerRequest.HttpServerRequest["headers"],
  name: string
) => headers[name];

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

const toCheckoutBadRequest = (locale?: string, cause?: Schema.SchemaError) => {
  const message = checkoutApiErrorMessage(locale, "checkout.badRequest");
  return makeInputInvalid({
    issues:
      cause === undefined
        ? [new ErrorIssue({ message, path: [] })]
        : makeSchemaErrorIssues(cause, message),
    message,
  });
};

const getCheckoutRequestHeadersFromRequest = Effect.gen(
  function* getCheckoutRequestHeadersFromRequest() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const locale = getHeader(request.headers, "x-context-locale");
    const businessUnitId = getHeader(
      request.headers,
      "x-context-business-unit-id"
    );

    if (locale === undefined) {
      return yield* Effect.fail(toCheckoutBadRequest());
    }

    return yield* Schema.decodeUnknownEffect(CommerceRequestHeaders)({
      "x-context-locale": locale,
      ...(businessUnitId === undefined
        ? {}
        : { "x-context-business-unit-id": businessUnitId }),
    }).pipe(Effect.mapError((cause) => toCheckoutBadRequest(locale, cause)));
  }
);

const toCheckoutContextAuthError = (
  locale: string,
  error: AccessTokenInvalid | AccessTokenVerificationFailure
) => {
  switch (error._tag) {
    case "AccessTokenInvalid": {
      return makeCheckoutUnauthenticated({
        message: "Authentication is required.",
      });
    }
    case "AccessTokenVerificationFailure": {
      return makeCheckoutAuthenticationUnavailable({
        message: checkoutApiErrorMessage(locale, "checkout.internal"),
      });
    }
    default: {
      exhaustive(error);
      return makeCheckoutAuthenticationUnavailable({
        message: checkoutApiErrorMessage(locale, "checkout.internal"),
      });
    }
  }
};

interface CheckoutAccessTokenVerifier {
  readonly verify: (
    token: string
  ) => Effect.Effect<
    VerifiedAccessToken,
    AccessTokenInvalid | AccessTokenVerificationFailure
  >;
}

const getAuthUserIdFromCredential = (
  headers: CommerceRequestHeaders,
  credential: Redacted.Redacted,
  accessTokenVerifier: CheckoutAccessTokenVerifier
) =>
  Effect.gen(function* getAuthUserIdFromCredential() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const authorization = parseBearerAuthorization(
      getHeader(request.headers, "authorization"),
      credential
    );
    const locale = headers["x-context-locale"];

    if (authorization._tag === "Missing") {
      return null;
    }
    if (authorization._tag === "Invalid") {
      return yield* Effect.fail(
        makeCheckoutUnauthenticated({ message: "Authentication is required." })
      );
    }

    const verifiedToken = yield* accessTokenVerifier
      .verify(authorization.token)
      .pipe(
        Effect.catchTags({
          AccessTokenInvalid: (error) =>
            Effect.fail(toCheckoutContextAuthError(locale, error)),
          AccessTokenVerificationFailure: (error) =>
            logCheckoutDiagnosticFailure(error).pipe(
              Effect.andThen(
                error.reason === "unavailable"
                  ? Effect.fail(toCheckoutContextAuthError(locale, error))
                  : Effect.die(error)
              )
            ),
        })
      );
    return AuthUserId.make(verifiedToken.authUserId);
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
  headers: CommerceRequestHeaders,
  authUserId: AuthUserId | null
) =>
  Effect.gen(function* makeHttpCommerceRequest() {
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
      cookieCartId === null ? undefined : CartId.make(cookieCartId);
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
    Effect.gen(function* checkoutSessionMiddlewareLayer() {
      const accessTokenVerifier = yield* AccessTokenVerifier;
      const commerceServices = yield* Effect.context<CommerceStableServices>();

      return {
        accessToken: (httpEffect, { credential }) =>
          Effect.gen(function* accessToken() {
            const headers = yield* getCheckoutRequestHeadersFromRequest;
            const locale = headers["x-context-locale"];
            const authUserId = yield* getAuthUserIdFromCredential(
              headers,
              credential,
              accessTokenVerifier
            );
            const request = yield* makeHttpCommerceRequest(headers, authUserId);
            return yield* httpEffect.pipe(
              commerceApp.provide(request),
              Effect.provide(commerceServices),
              Effect.catchTags({
                CommerceAccountUnavailable: (error) =>
                  logCheckoutDiagnosticFailure(error).pipe(
                    Effect.andThen(
                      Effect.fail(projectCheckoutRequestFailure(error, locale))
                    )
                  ),
                CommerceRequestContextNotFound: (error) =>
                  Effect.fail(projectCheckoutRequestFailure(error, locale)),
                ConfigError: (error) =>
                  logCheckoutDiagnosticFailure(error).pipe(
                    Effect.andThen(Effect.die(error))
                  ),
              })
            );
          }),
      };
    })
  );

const checkoutSchemaErrorMiddlewareLayer =
  HttpApiMiddleware.layerSchemaErrorTransform(
    CheckoutSchemaErrorMiddleware,
    (error) =>
      error.kind === "Body"
        ? Effect.die(error)
        : Effect.gen(function* checkoutSchemaErrorMiddlewareLayer() {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const locale = getHeader(request.headers, "x-context-locale");
            return yield* Effect.fail(
              toCheckoutBadRequest(locale, error.cause)
            );
          })
  );

const makeCheckoutHttpHandlers = () =>
  HttpApiBuilder.group(
    CheckoutHttpApi,
    "checkout",
    Effect.fn(function* makeCheckoutHttpHandlers(handlers) {
      return handlers
        .handle("current", ({ headers }) =>
          CheckoutSession.getCurrent().pipe(
            Effect.map(toCheckoutApiState),
            Effect.mapError((error) =>
              projectCheckoutReadFailure(error, headers["x-context-locale"])
            )
          )
        )
        .handle("saveContact", ({ headers, payload }) =>
          CheckoutSession.saveContact({
            cart: payload.cart,
            contact: payload.contact,
          }).pipe(
            Effect.map(toCheckoutApiState),
            Effect.mapError((error) =>
              projectSaveCheckoutContactFailure(
                error,
                headers["x-context-locale"]
              )
            )
          )
        )
        .handle("saveDeliveryDetails", ({ headers, payload }) =>
          CheckoutSession.saveDeliveryDetails({
            cart: payload.cart,
            deliveryDetails: payload.deliveryDetails,
          }).pipe(
            Effect.map((result) => toCheckoutApiState(result.state)),
            Effect.mapError((error) =>
              projectSaveCheckoutDeliveryDetailsFailure(
                error,
                headers["x-context-locale"]
              )
            )
          )
        );
    })
  );

const makeCheckoutHttpApiLayer = (dependencies: CheckoutHttpDependencies) =>
  HttpApiBuilder.layer(CheckoutHttpApi).pipe(
    Layer.provide(makeCheckoutHttpHandlers()),
    Layer.provide(checkoutSchemaErrorMiddlewareLayer),
    Layer.provide(checkoutSessionMiddlewareLayer(dependencies.commerceApp)),
    Layer.provide(unexpectedHttpErrorsLayer),
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
