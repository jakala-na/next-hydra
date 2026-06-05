import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  OpenApi,
} from "effect/unstable/httpapi";
import { CartId } from "../domain/cart";
import {
  CheckoutLocale,
  type CheckoutScope,
  CheckoutState,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../domain/checkout";
import { CommerceCustomerId } from "../domain/commerce-account";

export class CheckoutApiError extends Schema.TaggedErrorClass<CheckoutApiError>()(
  "CheckoutApiError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}

export class CheckoutApiNotFound extends Schema.TaggedErrorClass<CheckoutApiNotFound>()(
  "CheckoutApiNotFound",
  {
    message: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export class CheckoutApiBadRequest extends Schema.TaggedErrorClass<CheckoutApiBadRequest>()(
  "CheckoutApiBadRequest",
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class CommerceContextHeaders extends Schema.Class<CommerceContextHeaders>(
  "CommerceContextHeaders"
)({
  "x-context-locale": CheckoutLocale,
  "x-context-anonymous-cart-id": Schema.optional(CartId),
  "x-context-customer-id": Schema.optional(CommerceCustomerId),
}) {}

const CheckoutApiErrors = [
  CheckoutApiBadRequest,
  CheckoutApiError,
  CheckoutApiNotFound,
] as const;

export class CurrentCheckoutScope extends Context.Service<
  CurrentCheckoutScope,
  CheckoutScope
>()("@repo/commerce/http/CurrentCheckoutScope") {}

export class CheckoutScopeMiddleware extends HttpApiMiddleware.Service<
  CheckoutScopeMiddleware,
  {
    readonly provides: CurrentCheckoutScope;
    readonly requires: never;
  }
>()("@repo/commerce/http/CheckoutScopeMiddleware", {
  error: CheckoutApiBadRequest,
}) {}

export class CheckoutApiGroup extends HttpApiGroup.make("checkout")
  .add(
    HttpApiEndpoint.get("current", "/checkout/current", {
      headers: CommerceContextHeaders,
      success: CheckoutState,
      error: CheckoutApiErrors,
    })
  )
  .middleware(CheckoutScopeMiddleware)
  .annotateMerge(
    OpenApi.annotations({
      title: "Checkout",
      description: "Checkout state read endpoints",
    })
  ) {}

export class CheckoutHttpApi extends HttpApi.make("checkout-http-api")
  .add(CheckoutApiGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "Checkout HTTP API",
      version: "1.0.0",
    })
  ) {}

export const toCheckoutScope = (
  headers: CommerceContextHeaders
): CheckoutScope => {
  const locale = headers["x-context-locale"];
  const customerId = headers["x-context-customer-id"];

  if (customerId) {
    return new StorefrontCustomerCheckoutScope({
      channel: "storefrontCustomer",
      locale,
      customerId,
    });
  }

  return new StorefrontAnonymousCheckoutScope({
    channel: "storefrontAnonymous",
    locale,
    ...(headers["x-context-anonymous-cart-id"] === undefined
      ? {}
      : { anonymousCartId: headers["x-context-anonymous-cart-id"] }),
  });
};
