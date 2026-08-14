import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  OpenApi,
} from "effect/unstable/httpapi";
import { AddressBookReference } from "../domain/address-book";
import {
  CheckoutCartReference,
  CheckoutContactInput,
  CheckoutDeliveryDetailsInput,
  CheckoutState,
  CheckoutViolation,
} from "../domain/checkout";
import type { CheckoutSession } from "../lib/checkout/checkout-session";
import { CommerceRequestHeaders } from "./commerce-request";

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

const CheckoutReadErrors = [
  CheckoutApiBadRequest,
  CheckoutApiError,
  CheckoutApiNotFound,
] as const;

const CheckoutMutationErrors = [
  ...CheckoutReadErrors,
  CheckoutApiConflict,
] as const;

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
}) {}

export class CheckoutApiGroup extends HttpApiGroup.make("checkout")
  .add(
    HttpApiEndpoint.get("current", "/checkout/current", {
      error: CheckoutReadErrors,
      headers: CommerceRequestHeaders,
      success: CheckoutApiState,
    }).annotate(OpenApi.Summary, "Get the current checkout")
  )
  .add(
    HttpApiEndpoint.post("saveContact", "/checkout/contact", {
      error: CheckoutMutationErrors,
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutContactRequest,
      success: CheckoutApiState,
    }).annotate(OpenApi.Summary, "Save checkout contact details")
  )
  .add(
    HttpApiEndpoint.post("saveDeliveryDetails", "/checkout/delivery-details", {
      error: CheckoutMutationErrors,
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutDeliveryDetailsRequest,
      success: CheckoutApiState,
    }).annotate(OpenApi.Summary, "Save checkout delivery details")
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
