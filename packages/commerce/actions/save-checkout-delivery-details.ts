import { Effect, Result, Schema } from "effect";
import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import { CountryCodeFromString } from "../domain/checkout";
import type { CommerceRequestContext } from "../domain/commerce-request-context";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { checkoutRuntimeLayerCommercetools } from "../lib/checkout/commercetools";
import { logUnexpectedCheckoutMutationFailure } from "./checkout-action-diagnostics";
import {
  checkoutDeliveryDetailsMutationFailureToActionState,
  checkoutDeliveryDetailsNotFoundState,
  invalidCheckoutDeliveryDetailsFormState,
  type SaveCheckoutDeliveryDetailsActionState,
  saveCheckoutDeliveryDetailsActionSuccess,
} from "./save-checkout-delivery-details-state";

const ShippingAddressForm = Schema.Struct({
  addressLine1: Schema.String,
  postalCode: Schema.String,
  city: Schema.String,
  country: CountryCodeFromString,
  addressLine2: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
});

const DeliveryDetailsForm = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("manual"),
    shippingAddress: ShippingAddressForm,
    saveToAddressBook: Schema.Literal(false),
  }),
  Schema.Struct({
    type: Schema.Literal("manual"),
    shippingAddress: ShippingAddressForm,
    saveToAddressBook: Schema.Literal(true),
    makeDefaultShipping: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("addressBook"),
    addressBookReference: AddressBookReference,
  }),
]);

const SaveCheckoutDeliveryDetailsForm = Schema.Struct({
  cartId: CartId,
  cartVersion: Schema.NumberFromString,
  deliveryDetails: DeliveryDetailsForm,
});

type SaveCheckoutDeliveryDetailsForm =
  typeof SaveCheckoutDeliveryDetailsForm.Type;

const formString = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const formCheckbox = (formData: FormData, name: string): unknown => {
  const value = formData.get(name);

  if (value === null || value === "false") {
    return false;
  }

  if (value === "on" || value === "true") {
    return true;
  }

  return value;
};

const deliveryDetailsFromForm = (formData: FormData) => {
  const addressBookReference = formString(formData, "addressBookReference");

  if (addressBookReference !== undefined) {
    return {
      type: "addressBook",
      addressBookReference,
    };
  }

  const saveToAddressBook = formCheckbox(formData, "saveToAddressBook");

  return {
    type: "manual",
    saveToAddressBook,
    ...(saveToAddressBook === true
      ? {
          makeDefaultShipping: formCheckbox(formData, "makeDefaultShipping"),
        }
      : {}),
    shippingAddress: {
      addressLine1: formString(formData, "addressLine1"),
      postalCode: formString(formData, "postalCode"),
      city: formString(formData, "city"),
      country: formString(formData, "country"),
      addressLine2: formString(formData, "addressLine2") || undefined,
      region: formString(formData, "region") || undefined,
    },
  };
};

const getFormInput = (formData: FormData) =>
  Schema.decodeUnknownEffect(SaveCheckoutDeliveryDetailsForm)({
    cartId: formString(formData, "cartId"),
    cartVersion: formString(formData, "cartVersion"),
    deliveryDetails: deliveryDetailsFromForm(formData),
  });

const saveDeliveryDetails = (
  context: CommerceRequestContext,
  input: SaveCheckoutDeliveryDetailsForm
) =>
  CheckoutSession.saveDeliveryDetails({
    context,
    cart: {
      id: input.cartId,
      version: input.cartVersion,
    },
    deliveryDetails: input.deliveryDetails,
  }).pipe(Effect.provide(checkoutRuntimeLayerCommercetools));

export async function saveCheckoutDeliveryDetailsForContext(
  context: CommerceRequestContext,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionState> {
  const inputResult = await Effect.runPromise(
    Effect.result(getFormInput(formData))
  );

  if (Result.isFailure(inputResult)) {
    return invalidCheckoutDeliveryDetailsFormState;
  }

  const saveResult = await Effect.runPromise(
    saveDeliveryDetails(context, inputResult.success).pipe(
      Effect.tapError(logUnexpectedCheckoutMutationFailure),
      Effect.result
    )
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
