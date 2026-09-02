import { InputInvalid } from "@repo/errors";
import { UnexpectedHttpErrors } from "@repo/errors/http";
import { PaymentOptions } from "@repo/payments";
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
  PrepareCheckoutPaymentOptionsOperationPublicErrors,
  PlaceCheckoutOrderOperationPublicErrors,
  CheckoutRequestPublicErrors,
  CheckoutUnauthenticated,
  SaveCheckoutContactOperationPublicErrors,
  SaveCheckoutDeliveryDetailsOperationPublicErrors,
  SaveCheckoutPaymentOptionsOperationPublicErrors,
  SaveCheckoutShippingOptionsOperationPublicErrors,
} from "../checkout/public-errors";
import { CheckoutPublicState } from "../checkout/public-state";
import {
  PlaceCheckoutOrderInput,
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
  SaveCheckoutPaymentOptionsInput,
  SaveCheckoutShippingOptionsInput,
} from "../domain/checkout";
import { DeliveryPlanQuote } from "../domain/delivery-plan";
import { OrderPlacementResult } from "../domain/order";
import type { CheckoutSession } from "../lib/checkout/checkout-session";
import { CommerceRequestHeaders } from "./commerce-request";

export const CheckoutApiState = CheckoutPublicState;
export type CheckoutApiState = typeof CheckoutApiState.Type;

export const CheckoutApiSnapshot = Schema.Struct({
  ...CheckoutApiState.fields,
  deliveryPlanQuote: DeliveryPlanQuote,
});
export type CheckoutApiSnapshot = typeof CheckoutApiSnapshot.Type;

export const CheckoutApiPaymentOptionsSnapshot = Schema.Struct({
  paymentOptions: PaymentOptions,
  state: CheckoutApiState,
});
export type CheckoutApiPaymentOptionsSnapshot =
  typeof CheckoutApiPaymentOptionsSnapshot.Type;

export const SaveCheckoutContactRequest = SaveCheckoutContactInput;
export type SaveCheckoutContactRequest = typeof SaveCheckoutContactRequest.Type;

export const SaveCheckoutDeliveryDetailsRequest =
  SaveCheckoutDeliveryDetailsInput;
export type SaveCheckoutDeliveryDetailsRequest =
  typeof SaveCheckoutDeliveryDetailsRequest.Type;

export const SaveCheckoutShippingOptionsRequest =
  SaveCheckoutShippingOptionsInput;
export type SaveCheckoutShippingOptionsRequest =
  typeof SaveCheckoutShippingOptionsRequest.Type;

export const SaveCheckoutPaymentOptionsRequest =
  SaveCheckoutPaymentOptionsInput;
export type SaveCheckoutPaymentOptionsRequest =
  typeof SaveCheckoutPaymentOptionsRequest.Type;

export const PlaceCheckoutOrderRequest = PlaceCheckoutOrderInput;
export type PlaceCheckoutOrderRequest = typeof PlaceCheckoutOrderRequest.Type;

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
    transform: (operation) => {
      const security: unknown[] = [{}];
      const configuredSecurity: unknown = operation.security;
      if (Array.isArray(configuredSecurity)) {
        for (const requirement of configuredSecurity) {
          security.push(requirement);
        }
      }
      return { ...operation, security };
    },
  });

export class CheckoutApiGroup extends HttpApiGroup.make("checkout")
  .add(
    HttpApiEndpoint.get("current", "/checkout/current", {
      error: CheckoutCurrentOperationPublicErrors,
      headers: CommerceRequestHeaders,
      success: CheckoutApiSnapshot,
    }).annotateMerge(optionalAccessTokenOpenApi("Get the current checkout"))
  )
  .add(
    HttpApiEndpoint.post(
      "preparePaymentOptions",
      "/checkout/payment-options/prepare",
      {
        error: PrepareCheckoutPaymentOptionsOperationPublicErrors,
        headers: CommerceRequestHeaders,
        success: CheckoutApiPaymentOptionsSnapshot,
      }
    ).annotateMerge(optionalAccessTokenOpenApi("Prepare payment options"))
  )
  .add(
    HttpApiEndpoint.post("placeOrder", "/checkout/orders", {
      error: PlaceCheckoutOrderOperationPublicErrors,
      headers: CommerceRequestHeaders,
      payload: PlaceCheckoutOrderRequest,
      success: OrderPlacementResult,
    }).annotateMerge(optionalAccessTokenOpenApi("Place the checkout order"))
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
  .add(
    HttpApiEndpoint.post("saveShippingOptions", "/checkout/shipping-options", {
      error: SaveCheckoutShippingOptionsOperationPublicErrors,
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutShippingOptionsRequest,
      success: CheckoutApiState,
    }).annotateMerge(
      optionalAccessTokenOpenApi("Save checkout shipping options")
    )
  )
  .add(
    HttpApiEndpoint.post("savePaymentOptions", "/checkout/payment-options", {
      error: SaveCheckoutPaymentOptionsOperationPublicErrors,
      headers: CommerceRequestHeaders,
      payload: SaveCheckoutPaymentOptionsRequest,
      success: CheckoutApiState,
    }).annotateMerge(
      optionalAccessTokenOpenApi("Save checkout payment options")
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
