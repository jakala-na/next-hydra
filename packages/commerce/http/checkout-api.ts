import { InputInvalid } from "@repo/errors";
import { UnexpectedHttpErrors } from "@repo/errors/http";
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  OpenApi,
} from "effect/unstable/httpapi";

import {
  CheckoutAuthenticationUnavailable,
  CheckoutCurrentOperationPublicErrors,
  CheckoutRequestPublicErrors,
  CheckoutUnauthenticated,
  SaveCheckoutContactOperationPublicErrors,
  SaveCheckoutDeliveryDetailsOperationPublicErrors,
} from "../checkout/public-errors";
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
  error: InputInvalid,
}) {}

export class CheckoutSessionMiddleware extends HttpApiMiddleware.Service<
  CheckoutSessionMiddleware,
  {
    readonly provides: CheckoutSession;
    readonly requires: never;
  }
>()("@repo/commerce/http/CheckoutSessionMiddleware", {
  error: [
    InputInvalid,
    CheckoutAuthenticationUnavailable,
    CheckoutUnauthenticated,
    ...CheckoutRequestPublicErrors,
  ],
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
      error: CheckoutCurrentOperationPublicErrors,
      headers: CommerceRequestHeaders,
      success: CheckoutApiState,
    }).annotateMerge(optionalAccessTokenOpenApi("Get the current checkout"))
  )
  .add(
    HttpApiEndpoint.post("saveContact", "/checkout/contact", {
      error: SaveCheckoutContactOperationPublicErrors,
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutContactRequest,
      success: CheckoutApiState,
    }).annotateMerge(
      optionalAccessTokenOpenApi("Save checkout contact details")
    )
  )
  .add(
    HttpApiEndpoint.post("saveDeliveryDetails", "/checkout/delivery-details", {
      error: SaveCheckoutDeliveryDetailsOperationPublicErrors,
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
  .middleware(UnexpectedHttpErrors)
  .annotateMerge(
    OpenApi.annotations({
      title: "Checkout HTTP API",
      version: "1.0.0",
    })
  ) {}
