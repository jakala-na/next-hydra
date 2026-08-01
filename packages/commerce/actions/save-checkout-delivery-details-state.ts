import type { AddressBookReference } from "../domain/address-book";
import type { CheckoutMutationFailure } from "../domain/checkout";

export type SaveCheckoutDeliveryDetailsActionErrorCode =
  | "checkout.cartMismatch"
  | "checkout.deliveryDetails.addressBookEntryUnavailable"
  | "checkout.deliveryDetails.invalidInput"
  | "checkout.deliveryDetails.sourceUnavailable"
  | "checkout.deliveryDetails.providerFailure"
  | "checkout.deliveryDetails.unsupported"
  | "checkout.notFound"
  | "checkout.versionConflict";

export type SaveCheckoutDeliveryDetailsActionState =
  | {
      readonly status: "idle" | "success";
    }
  | {
      readonly status: "error";
      readonly code: SaveCheckoutDeliveryDetailsActionErrorCode;
      readonly parameters?: {
        readonly addressBookReference: AddressBookReference;
      };
    };

export type SaveCheckoutDeliveryDetailsAction = (
  previousState: SaveCheckoutDeliveryDetailsActionState,
  formData: FormData
) => Promise<SaveCheckoutDeliveryDetailsActionState>;

export const initialSaveCheckoutDeliveryDetailsActionState = {
  status: "idle",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const saveCheckoutDeliveryDetailsActionSuccess = {
  status: "success",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const invalidCheckoutDeliveryDetailsFormState = {
  status: "error",
  code: "checkout.deliveryDetails.invalidInput",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const checkoutDeliveryDetailsNotFoundState = {
  status: "error",
  code: "checkout.notFound",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const checkoutDeliveryDetailsMutationFailureToActionState = (
  error: CheckoutMutationFailure
): SaveCheckoutDeliveryDetailsActionState => {
  const parameters =
    "addressBookReference" in error && error.addressBookReference !== undefined
      ? { addressBookReference: error.addressBookReference }
      : undefined;

  switch (error._tag) {
    case "CheckoutCartMismatch":
      return {
        status: "error",
        code: "checkout.cartMismatch",
      };
    case "CheckoutMutationSchemaFailure":
      return {
        status: "error",
        code: "checkout.deliveryDetails.invalidInput",
      };
    case "CheckoutMutationSourceUnavailable":
      return {
        status: "error",
        code: "checkout.deliveryDetails.sourceUnavailable",
      };
    case "CheckoutMutationAddressBookEntryUnavailable":
      return {
        status: "error",
        code: "checkout.deliveryDetails.addressBookEntryUnavailable",
        parameters: {
          addressBookReference: error.addressBookReference,
        },
      };
    case "CheckoutVersionConflict":
      return {
        status: "error",
        code: "checkout.versionConflict",
        ...(parameters === undefined ? {} : { parameters }),
      };
    case "CheckoutMutationProviderFailure":
      return {
        status: "error",
        code: "checkout.deliveryDetails.providerFailure",
        ...(parameters === undefined ? {} : { parameters }),
      };
    case "CheckoutMutationUnsupported":
      return {
        status: "error",
        code: "checkout.deliveryDetails.unsupported",
      };
    default:
      error satisfies never;
      return {
        status: "error",
        code: "checkout.deliveryDetails.providerFailure",
      };
  }
};
