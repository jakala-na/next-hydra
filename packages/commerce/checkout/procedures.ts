import "server-only";
import { makeSchemaErrorIssues } from "@repo/errors";
import { Effect } from "effect";
import type { Schema } from "effect";

import {
  PlaceCheckoutOrderInput,
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
  SaveCheckoutPaymentOptionsInput,
  SaveCheckoutShippingOptionsInput,
} from "../domain/checkout";
import { OrderPlacementResult } from "../domain/order";
import type { CheckoutPlaceOrderFailure } from "../lib/checkout/checkout-session";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import type { CommerceActionClient } from "../runtime";
import {
  SaveCheckoutContactActionError,
  SaveCheckoutDeliveryDetailsActionError,
  SaveCheckoutPaymentOptionsActionError,
  SaveCheckoutShippingOptionsActionError,
  PlaceCheckoutOrderActionError,
} from "./action-contract";
import type {
  CheckoutSaveContactExpectedFailure,
  CheckoutSaveDeliveryDetailsExpectedFailure,
  CheckoutSavePaymentOptionsExpectedFailure,
  CheckoutSaveShippingOptionsExpectedFailure,
} from "./public-errors";
import {
  projectSaveCheckoutContactFailure,
  projectSaveCheckoutDeliveryDetailsFailure,
  projectSaveCheckoutPaymentOptionsFailure,
  projectSaveCheckoutShippingOptionsFailure,
  projectPlaceCheckoutOrderFailure,
} from "./public-errors";
import { CheckoutPublicState, toCheckoutPublicState } from "./public-state";

const saveCheckoutContactProgram = Effect.fn("CheckoutAction.saveContact")(
  (input: SaveCheckoutContactInput) =>
    CheckoutSession.saveContact(input).pipe(Effect.map(toCheckoutPublicState))
);

const saveCheckoutDeliveryDetailsProgram = Effect.fn(
  "CheckoutAction.saveDeliveryDetails"
)((input: SaveCheckoutDeliveryDetailsInput) =>
  CheckoutSession.saveDeliveryDetails(input).pipe(
    Effect.map(({ state }) => toCheckoutPublicState(state))
  )
);

const saveCheckoutShippingOptionsProgram = Effect.fn(
  "CheckoutAction.saveShippingOptions"
)((input: SaveCheckoutShippingOptionsInput) =>
  CheckoutSession.saveShippingOptions(input).pipe(
    Effect.map(toCheckoutPublicState)
  )
);

const saveCheckoutPaymentOptionsProgram = Effect.fn(
  "CheckoutAction.savePaymentOptions"
)((input: SaveCheckoutPaymentOptionsInput) =>
  CheckoutSession.savePaymentOptions(input).pipe(
    Effect.map(toCheckoutPublicState)
  )
);

const placeCheckoutOrderProgram = Effect.fn("CheckoutAction.placeOrder")(
  (input: PlaceCheckoutOrderInput) => CheckoutSession.placeOrder(input)
);

const checkoutInputIssues = (error: Schema.SchemaError) =>
  makeSchemaErrorIssues(error, "This field is invalid.");

export const makeCheckoutProcedures = <
  RuntimeServices,
  Context extends { readonly locale: string },
>(
  actions: CommerceActionClient<CheckoutSession, RuntimeServices, Context>
) => ({
  placeCheckoutOrderProcedure: actions
    .procedure("CheckoutAction.placeOrder")
    .input(PlaceCheckoutOrderInput)
    .output(OrderPlacementResult)
    .error(PlaceCheckoutOrderActionError)
    .mapInputIssues(checkoutInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutPlaceOrderFailure>((error, { locale }) =>
      projectPlaceCheckoutOrderFailure(error, locale)
    )
    .handle(placeCheckoutOrderProgram),
  saveCheckoutContactProcedure: actions
    .procedure("CheckoutAction.saveContact")
    .input(SaveCheckoutContactInput)
    .output(CheckoutPublicState)
    .error(SaveCheckoutContactActionError)
    .mapInputIssues(checkoutInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSaveContactExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutContactFailure(error, locale)
    )
    .handle(saveCheckoutContactProgram),
  saveCheckoutDeliveryDetailsProcedure: actions
    .procedure("CheckoutAction.saveDeliveryDetails")
    .input(SaveCheckoutDeliveryDetailsInput)
    .output(CheckoutPublicState)
    .error(SaveCheckoutDeliveryDetailsActionError)
    .mapInputIssues(checkoutInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSaveDeliveryDetailsExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutDeliveryDetailsFailure(error, locale)
    )
    .handle(saveCheckoutDeliveryDetailsProgram),
  saveCheckoutPaymentOptionsProcedure: actions
    .procedure("CheckoutAction.savePaymentOptions")
    .input(SaveCheckoutPaymentOptionsInput)
    .output(CheckoutPublicState)
    .error(SaveCheckoutPaymentOptionsActionError)
    .mapInputIssues(checkoutInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSavePaymentOptionsExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutPaymentOptionsFailure(error, locale)
    )
    .handle(saveCheckoutPaymentOptionsProgram),
  saveCheckoutShippingOptionsProcedure: actions
    .procedure("CheckoutAction.saveShippingOptions")
    .input(SaveCheckoutShippingOptionsInput)
    .output(CheckoutPublicState)
    .error(SaveCheckoutShippingOptionsActionError)
    .mapInputIssues(checkoutInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSaveShippingOptionsExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutShippingOptionsFailure(error, locale)
    )
    .handle(saveCheckoutShippingOptionsProgram),
});
