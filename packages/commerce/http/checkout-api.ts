import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  OpenApi,
} from "effect/unstable/httpapi";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import {
  CheckoutCartReference,
  CheckoutContactInput,
  CheckoutDeliveryDetailsInput,
  CheckoutLocale,
  type CheckoutScope,
  CheckoutState,
  CheckoutViolation,
} from "../domain/checkout";

export const CheckoutApiViolation = Schema.Struct({
  ...CheckoutViolation.fields,
  message: Schema.String,
});
export type CheckoutApiViolation = typeof CheckoutApiViolation.Type;

export const CheckoutApiState = Schema.Struct({
  ...CheckoutState.fields,
  violations: Schema.Array(CheckoutApiViolation),
});
export type CheckoutApiState = typeof CheckoutApiState.Type;

export const CheckoutApiErrorParameters = Schema.Struct({
  addressBookReference: Schema.optional(AddressBookReference),
});
export type CheckoutApiErrorParameters = typeof CheckoutApiErrorParameters.Type;

export class CheckoutApiError extends Schema.TaggedErrorClass<CheckoutApiError>()(
  "CheckoutApiError",
  {
    code: Schema.Literals([
      "checkout.addressBook.providerFailure",
      "checkout.internal",
      "checkout.deliveryDetails.providerFailure",
    ]),
    message: Schema.String,
    parameters: Schema.optional(CheckoutApiErrorParameters),
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
    code: Schema.Literals([
      "checkout.addressBook.accessDenied",
      "checkout.badRequest",
      "checkout.deliveryDetails.invalidInput",
      "checkout.deliveryDetails.sourceUnavailable",
      "checkout.deliveryDetails.addressBookEntryUnavailable",
    ]),
    message: Schema.String,
    parameters: Schema.optional(CheckoutApiErrorParameters),
  },
  { httpApiStatus: 400 }
) {}

export class CheckoutApiConflict extends Schema.TaggedErrorClass<CheckoutApiConflict>()(
  "CheckoutApiConflict",
  {
    code: Schema.Literals([
      "checkout.cartMismatch",
      "checkout.versionConflict",
    ]),
    message: Schema.String,
    parameters: Schema.optional(CheckoutApiErrorParameters),
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
  contact: CheckoutContactInput,
}) {}

export class SaveCheckoutDeliveryDetailsRequest extends Schema.Class<SaveCheckoutDeliveryDetailsRequest>(
  "SaveCheckoutDeliveryDetailsRequest"
)({
  cart: CheckoutCartReference,
  deliveryDetails: CheckoutDeliveryDetailsInput,
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

export class CheckoutSchemaErrorMiddleware extends HttpApiMiddleware.Service<
  CheckoutSchemaErrorMiddleware,
  {
    readonly requires: never;
  }
>()("@repo/commerce/http/CheckoutSchemaErrorMiddleware", {
  error: CheckoutApiBadRequest,
}) {}

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
    HttpApiEndpoint.get("addressBook", "/address-book", {
      headers: CheckoutRequestHeaders,
      success: Schema.Array(AddressBookEntry),
      error: CheckoutApiErrors,
    })
  )
  .add(
    HttpApiEndpoint.get("current", "/checkout/current", {
      headers: CheckoutRequestHeaders,
      success: CheckoutApiState,
      error: CheckoutApiErrors,
    })
  )
  .add(
    HttpApiEndpoint.post("saveContact", "/checkout/contact", {
      headers: CheckoutRequestHeaders,
      payload: SaveCheckoutContactRequest,
      success: CheckoutApiState,
      error: CheckoutApiErrors,
    })
  )
  .add(
    HttpApiEndpoint.post("saveDeliveryDetails", "/checkout/delivery-details", {
      headers: CheckoutRequestHeaders,
      payload: SaveCheckoutDeliveryDetailsRequest,
      success: CheckoutApiState,
      error: CheckoutApiErrors,
    })
  )
  .middleware(CheckoutSchemaErrorMiddleware)
  .middleware(CheckoutScopeMiddleware)
  .annotateMerge(
    OpenApi.annotations({
      title: "Checkout",
      description: "Checkout and Business Unit Address Book endpoints",
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
