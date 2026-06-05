import {
  CheckoutApiBadRequest,
  CheckoutApiError,
  CheckoutApiNotFound,
  CheckoutHttpApi,
  CheckoutScopeMiddleware,
  CommerceContextHeaders,
  CurrentCheckoutScope,
  toCheckoutScope,
} from "@repo/commerce/http/checkout-api";
import {
  CheckoutSession,
  type CheckoutSession as CheckoutSessionService,
} from "@repo/commerce/lib/checkout/checkout-session";
import { Effect, Layer, Schema } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

type CheckoutRuntimeLayer = Layer.Layer<CheckoutSessionService, unknown, never>;

export interface CheckoutHttpDependencies {
  readonly layer: CheckoutRuntimeLayer;
}

const getHeader = (
  headers: HttpServerRequest.HttpServerRequest["headers"],
  name: string
) => headers[name];

const getCommerceContextHeadersFromRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const locale = getHeader(request.headers, "x-context-locale");
  const anonymousCartId = getHeader(
    request.headers,
    "x-context-anonymous-cart-id"
  );
  const customerId = getHeader(request.headers, "x-context-customer-id");

  if (locale === undefined) {
    return yield* Effect.fail(
      new CheckoutApiBadRequest({
        message: "Missing x-context-locale header",
      })
    );
  }

  return yield* Schema.decodeUnknownEffect(CommerceContextHeaders)({
    "x-context-locale": locale,
    ...(anonymousCartId === undefined
      ? {}
      : { "x-context-anonymous-cart-id": anonymousCartId }),
    ...(customerId === undefined
      ? {}
      : { "x-context-customer-id": customerId }),
  }).pipe(
    Effect.mapError(
      () =>
        new CheckoutApiBadRequest({
          message: "Invalid checkout headers",
        })
    )
  );
});

const checkoutScopeMiddlewareLayer = Layer.succeed(
  CheckoutScopeMiddleware,
  (httpEffect) =>
    Effect.gen(function* () {
      const headers = yield* getCommerceContextHeadersFromRequest;
      return yield* Effect.provideService(
        httpEffect,
        CurrentCheckoutScope,
        toCheckoutScope(headers)
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
          const scope = yield* CurrentCheckoutScope;
          return yield* CheckoutSession.getCurrent(scope);
        }).pipe(
          Effect.mapError((error) => {
            switch (error._tag) {
              case "CheckoutUnavailable":
                return new CheckoutApiNotFound({
                  message: error.message,
                });
              default:
                return new CheckoutApiError({
                  message: error.message,
                });
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
