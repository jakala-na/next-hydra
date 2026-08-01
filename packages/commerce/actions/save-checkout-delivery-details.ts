import { Effect, Result, Schema } from "effect";
import { CartId, type CartId as CartIdType } from "../domain/cart";
import { type CheckoutScope, CountryCodeFromString } from "../domain/checkout";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { checkoutRuntimeLayerCommercetools } from "../lib/checkout/commercetools";
import {
  checkoutDeliveryDetailsMutationFailureToActionState,
  checkoutDeliveryDetailsNotFoundState,
  invalidCheckoutDeliveryDetailsFormState,
  type SaveCheckoutDeliveryDetailsActionState,
  saveCheckoutDeliveryDetailsActionSuccess,
} from "./save-checkout-delivery-details-state";

const SaveCheckoutDeliveryDetailsForm = Schema.Struct({
  cartId: CartId,
  cartVersion: Schema.NumberFromString,
  addressLine1: Schema.String,
  postalCode: Schema.String,
  city: Schema.String,
  country: CountryCodeFromString,
  addressLine2: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
});

type SaveCheckoutDeliveryDetailsForm =
  typeof SaveCheckoutDeliveryDetailsForm.Type;

const formString = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const getFormInput = (formData: FormData) =>
  Schema.decodeUnknownEffect(SaveCheckoutDeliveryDetailsForm)({
    cartId: formString(formData, "cartId"),
    cartVersion: formString(formData, "cartVersion"),
    addressLine1: formString(formData, "addressLine1"),
    postalCode: formString(formData, "postalCode"),
    city: formString(formData, "city"),
    country: formString(formData, "country"),
    addressLine2: formString(formData, "addressLine2") || undefined,
    region: formString(formData, "region") || undefined,
  });

const saveDeliveryDetails = (
  scope: CheckoutScope,
  input: SaveCheckoutDeliveryDetailsForm
) =>
  CheckoutSession.saveDeliveryDetails({
    scope,
    cart: {
      id: input.cartId as CartIdType,
      version: input.cartVersion,
    },
    deliveryDetails: {
      type: "manual",
      saveToAddressBook: false,
      shippingAddress: {
        addressLine1: input.addressLine1,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
        ...(input.addressLine2 === undefined
          ? {}
          : { addressLine2: input.addressLine2 }),
        ...(input.region === undefined ? {} : { region: input.region }),
      },
    },
  }).pipe(Effect.provide(checkoutRuntimeLayerCommercetools));

export async function saveCheckoutDeliveryDetailsForScope(
  scope: CheckoutScope,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionState> {
  const inputResult = await Effect.runPromise(
    Effect.result(getFormInput(formData))
  );

  if (Result.isFailure(inputResult)) {
    return invalidCheckoutDeliveryDetailsFormState;
  }

  const saveResult = await Effect.runPromise(
    Effect.result(saveDeliveryDetails(scope, inputResult.success))
  );

  if (Result.isFailure(saveResult)) {
    if (saveResult.failure._tag === "CheckoutUnavailable") {
      return checkoutDeliveryDetailsNotFoundState;
    }

    return checkoutDeliveryDetailsMutationFailureToActionState(
      saveResult.failure
    );
  }

  return saveCheckoutDeliveryDetailsActionSuccess;
}
