import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  OpenApi,
} from "effect/unstable/httpapi";

import { AddressBookReference } from "../domain/address-book";
import { CartSnapshot } from "../domain/cart-snapshot";
import {
  CheckoutCartReference,
  CheckoutContactInput,
  CheckoutDetails,
  CheckoutDeliveryDetailsInput,
  CheckoutState,
  CheckoutViolation,
} from "../domain/checkout";
import type { CheckoutSession } from "../lib/checkout/checkout-session";
import { CommerceLocale } from "../store";
import { CommerceRequestHeaders } from "./commerce-request";

export const CheckoutApiViolation = Schema.Struct({
  ...CheckoutViolation.fields,
  message: Schema.String,
});
export type CheckoutApiViolation = typeof CheckoutApiViolation.Type;

export const CheckoutApiScope = Schema.Union([
  Schema.Struct({
    channel: Schema.Literal("storefrontAnonymous"),
    locale: CommerceLocale,
  }),
  Schema.Struct({
    channel: Schema.Literal("storefrontCustomer"),
    locale: CommerceLocale,
  }),
]);
export type CheckoutApiScope = typeof CheckoutApiScope.Type;

export const CheckoutApiDetails = Schema.Struct({
  contact: CheckoutDetails.fields.contact,
  deliveryDetails: CheckoutDetails.fields.deliveryDetails,
});
export type CheckoutApiDetails = typeof CheckoutApiDetails.Type;

export const CheckoutApiCart = Schema.Struct({
  checkoutDetails: CheckoutApiDetails,
  id: CartSnapshot.fields.id,
  lineItems: CartSnapshot.fields.lineItems,
  status: CartSnapshot.fields.status,
  storeKey: CartSnapshot.fields.storeKey,
  totalLineItemQuantity: CartSnapshot.fields.totalLineItemQuantity,
  totalPrice: CartSnapshot.fields.totalPrice,
});
export type CheckoutApiCart = typeof CheckoutApiCart.Type;

export const CheckoutApiState = Schema.Struct({
  activeStep: CheckoutState.fields.activeStep,
  cart: CheckoutApiCart,
  details: CheckoutApiDetails,
  scope: CheckoutApiScope,
  steps: CheckoutState.fields.steps,
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
    code: Schema.Literal("checkout.internal"),
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}

export class CheckoutDeliveryDetailsApiError extends Schema.TaggedErrorClass<CheckoutDeliveryDetailsApiError>()(
  "CheckoutDeliveryDetailsApiError",
  {
    code: Schema.Literal("checkout.deliveryDetails.providerFailure"),
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
    code: Schema.Literal("checkout.badRequest"),
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class CheckoutDeliveryDetailsApiBadRequest extends Schema.TaggedErrorClass<CheckoutDeliveryDetailsApiBadRequest>()(
  "CheckoutDeliveryDetailsApiBadRequest",
  {
    code: Schema.Literals([
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
  },
  { httpApiStatus: 409 }
) {}

export class CheckoutDeliveryDetailsApiConflict extends Schema.TaggedErrorClass<CheckoutDeliveryDetailsApiConflict>()(
  "CheckoutDeliveryDetailsApiConflict",
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

export class CheckoutSchemaErrorMiddleware extends HttpApiMiddleware.Service<
  CheckoutSchemaErrorMiddleware,
  {
    readonly requires: never;
  }
>()("@repo/commerce/http/CheckoutSchemaErrorMiddleware", {
  error: CheckoutApiBadRequest,
}) {}

export class CheckoutSessionMiddleware extends HttpApiMiddleware.Service<
  CheckoutSessionMiddleware,
  {
    readonly provides: CheckoutSession;
    readonly requires: never;
  }
>()("@repo/commerce/http/CheckoutSessionMiddleware", {
  error: [CheckoutApiBadRequest, CheckoutApiError, CheckoutApiNotFound],
  security: {
    accessToken: HttpApiSecurity.bearer,
  },
}) {}

const optionalAccessTokenOpenApi = (summary: string) =>
  OpenApi.annotations({
    summary,
    transform: (operation) => ({
      ...operation,
      security: [{}, ...operation.security],
    }),
  });

export class CheckoutApiGroup extends HttpApiGroup.make("checkout")
  .add(
    HttpApiEndpoint.get("current", "/checkout/current", {
      headers: CommerceRequestHeaders,
      success: CheckoutApiState,
    }).annotateMerge(optionalAccessTokenOpenApi("Get the current checkout"))
  )
  .add(
    HttpApiEndpoint.post("saveContact", "/checkout/contact", {
      error: CheckoutApiConflict,
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutContactRequest,
      success: CheckoutApiState,
    }).annotateMerge(
      optionalAccessTokenOpenApi("Save checkout contact details")
    )
  )
  .add(
    HttpApiEndpoint.post("saveDeliveryDetails", "/checkout/delivery-details", {
      error: [
        CheckoutDeliveryDetailsApiConflict,
        CheckoutDeliveryDetailsApiBadRequest,
        CheckoutDeliveryDetailsApiError,
      ],
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutDeliveryDetailsRequest,
      success: CheckoutApiState,
    }).annotateMerge(
      optionalAccessTokenOpenApi("Save checkout delivery details")
    )
  )
  .middleware(CheckoutSchemaErrorMiddleware)
  .middleware(CheckoutSessionMiddleware)
  .annotateMerge(
    OpenApi.annotations({
      description: "Checkout endpoints",
      title: "Checkout",
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
