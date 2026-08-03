"use server";

import { getLocale } from "@repo/i18n";
import { Effect, Option, Schema } from "effect";
import { revalidatePath } from "next/cache";
import { commerceRequestLayer } from "../commerce-context/request";
import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import { CountryCodeFromString } from "../domain/checkout";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { logUnexpectedCheckoutMutationFailure } from "./action-diagnostics";
import {
  checkoutContactNotFoundState,
  checkoutMutationFailureToActionState,
  invalidCheckoutContactFormState,
  type SaveCheckoutContactActionState,
  saveCheckoutContactActionSuccess,
} from "./save-contact-state";
import {
  checkoutDeliveryDetailsMutationFailureToActionState,
  checkoutDeliveryDetailsNotFoundState,
  invalidCheckoutDeliveryDetailsFormState,
  type SaveCheckoutDeliveryDetailsActionState,
  saveCheckoutDeliveryDetailsActionSuccess,
} from "./save-delivery-details-state";

const SaveCheckoutContactForm = Schema.Union([
  Schema.Struct({
    cartId: CartId,
    source: Schema.Literal("manual"),
    email: Schema.String,
    firstName: Schema.String,
    lastName: Schema.String,
    phoneNumber: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    cartId: CartId,
    source: Schema.Literal("customerProfile"),
  }),
]);

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
  deliveryDetails: DeliveryDetailsForm,
});

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

const decodeCheckoutContactForm = (formData: FormData) =>
  Schema.decodeUnknownOption(SaveCheckoutContactForm)({
    cartId: formString(formData, "cartId"),
    source: formString(formData, "source"),
    email: formString(formData, "email"),
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    phoneNumber: formString(formData, "phoneNumber") || undefined,
  });

const decodeCheckoutDeliveryDetailsForm = (formData: FormData) => {
  const addressBookReference = formString(formData, "addressBookReference");
  const saveToAddressBook = formCheckbox(formData, "saveToAddressBook");
  const deliveryDetails =
    addressBookReference === undefined
      ? {
          type: "manual",
          saveToAddressBook,
          ...(saveToAddressBook === true
            ? {
                makeDefaultShipping: formCheckbox(
                  formData,
                  "makeDefaultShipping"
                ),
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
        }
      : {
          type: "addressBook",
          addressBookReference,
        };

  return Schema.decodeUnknownOption(SaveCheckoutDeliveryDetailsForm)({
    cartId: formString(formData, "cartId"),
    deliveryDetails,
  });
};

const shouldRevalidateContact = (state: SaveCheckoutContactActionState) =>
  state.status === "success" ||
  (state.status === "error" &&
    (state.code === "checkout.cartMismatch" ||
      state.code === "checkout.versionConflict"));

const shouldRevalidateDeliveryDetails = (
  state: SaveCheckoutDeliveryDetailsActionState
) =>
  state.status === "success" ||
  (state.status === "error" &&
    (state.code === "checkout.cartMismatch" ||
      state.code === "checkout.versionConflict" ||
      (state.code === "checkout.deliveryDetails.providerFailure" &&
        state.parameters?.addressBookReference !== undefined)));

const contactProviderFailureState = {
  status: "error",
  code: "checkout.contact.providerFailure",
} as const satisfies SaveCheckoutContactActionState;

const deliveryDetailsProviderFailureState = {
  status: "error",
  code: "checkout.deliveryDetails.providerFailure",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export async function saveCheckoutContact(
  _previousState: SaveCheckoutContactActionState,
  formData: FormData
): Promise<SaveCheckoutContactActionState> {
  const input = Option.getOrUndefined(decodeCheckoutContactForm(formData));
  if (input === undefined) {
    return invalidCheckoutContactFormState;
  }

  const locale = await getLocale();
  const layer = await commerceRequestLayer(locale);
  const state = await Effect.runPromise(
    CheckoutSession.saveContact({
      cart: { id: input.cartId },
      contact:
        input.source === "customerProfile"
          ? { source: "customerProfile" }
          : {
              source: "manual",
              buyerContact: {
                email: input.email,
                firstName: input.firstName,
                lastName: input.lastName,
                ...(input.phoneNumber === undefined
                  ? {}
                  : { phoneNumber: input.phoneNumber }),
              },
            },
    }).pipe(
      Effect.tapError(logUnexpectedCheckoutMutationFailure),
      Effect.match({
        onFailure: (error) =>
          error._tag === "CheckoutUnavailable"
            ? checkoutContactNotFoundState
            : checkoutMutationFailureToActionState(error),
        onSuccess: () => saveCheckoutContactActionSuccess,
      }),
      Effect.provide(layer),
      Effect.catchTags({
        CommerceRequestContextNotFound: () =>
          Effect.succeed(checkoutContactNotFoundState),
        CommerceAccountError: () => Effect.succeed(contactProviderFailureState),
        CommerceRequestFailure: () =>
          Effect.succeed(contactProviderFailureState),
      })
    )
  );

  if (shouldRevalidateContact(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}

export async function saveCheckoutDeliveryDetails(
  _previousState: SaveCheckoutDeliveryDetailsActionState,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionState> {
  const input = Option.getOrUndefined(
    decodeCheckoutDeliveryDetailsForm(formData)
  );
  if (input === undefined) {
    return invalidCheckoutDeliveryDetailsFormState;
  }

  const locale = await getLocale();
  const layer = await commerceRequestLayer(locale);
  const state = await Effect.runPromise(
    CheckoutSession.saveDeliveryDetails({
      cart: { id: input.cartId },
      deliveryDetails: input.deliveryDetails,
    }).pipe(
      Effect.tapError(logUnexpectedCheckoutMutationFailure),
      Effect.match({
        onFailure: (error) =>
          error._tag === "CheckoutUnavailable"
            ? checkoutDeliveryDetailsNotFoundState
            : checkoutDeliveryDetailsMutationFailureToActionState(error),
        onSuccess: () => saveCheckoutDeliveryDetailsActionSuccess,
      }),
      Effect.provide(layer),
      Effect.catchTags({
        CommerceRequestContextNotFound: () =>
          Effect.succeed(checkoutDeliveryDetailsNotFoundState),
        CommerceAccountError: () =>
          Effect.succeed(deliveryDetailsProviderFailureState),
        CommerceRequestFailure: () =>
          Effect.succeed(deliveryDetailsProviderFailureState),
      })
    )
  );

  if (shouldRevalidateDeliveryDetails(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}
