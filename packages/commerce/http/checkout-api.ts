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
  CheckoutCartReference,
  CheckoutContact,
  CheckoutLocale,
  type CheckoutScope,
  CheckoutState,
} from "../domain/checkout";

export class CheckoutApiError extends Schema.TaggedErrorClass<CheckoutApiError>()(
  "CheckoutApiError",
  {
    code: Schema.Literal("checkout.internal"),
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}

export class CheckoutApiNotFound extends Schema.TaggedErrorClass<CheckoutApiNotFound>()(
  "CheckoutApiNotFound",
  {
    code: Schema.Literal("checkout.notFound"),
    message: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export class CheckoutApiBadRequest extends Schema.TaggedErrorClass<CheckoutApiBadRequest>()(
  "CheckoutApiBadRequest",
  {
    code: Schema.Literal("checkout.badRequest"),
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class CheckoutApiConflict extends Schema.TaggedErrorClass<CheckoutApiConflict>()(
  "CheckoutApiConflict",
  {
    code: Schema.Literal("checkout.versionConflict"),
    message: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class CheckoutRequestHeaders extends Schema.Class<CheckoutRequestHeaders>(
  "CheckoutRequestHeaders"
)({
  "x-context-locale": CheckoutLocale,
  "x-context-anonymous-cart-id": Schema.optional(CartId),
}) {}

export class SaveCheckoutContactRequest extends Schema.Class<SaveCheckoutContactRequest>(
  "SaveCheckoutContactRequest"
)({
  cart: CheckoutCartReference,
  contact: CheckoutContact,
}) {}

const CheckoutApiErrors = [
  CheckoutApiBadRequest,
  CheckoutApiConflict,
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
      headers: CheckoutRequestHeaders,
      success: CheckoutState,
      error: CheckoutApiErrors,
    })
  )
  .add(
    HttpApiEndpoint.post("saveContact", "/checkout/contact", {
      headers: CheckoutRequestHeaders,
      payload: SaveCheckoutContactRequest,
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
