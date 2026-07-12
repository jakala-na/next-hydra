import type { CheckoutMutationFailure } from "../domain/checkout";

export type SaveCheckoutDeliveryDetailsActionErrorCode =
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
      readonly message: string;
    };

export const initialSaveCheckoutDeliveryDetailsActionState = {
  status: "idle",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const saveCheckoutDeliveryDetailsActionSuccess = {
  status: "success",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const invalidCheckoutDeliveryDetailsFormState = {
  status: "error",
  code: "checkout.deliveryDetails.invalidInput",
  message: "Enter address line 1, postal code, city, and country.",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const checkoutDeliveryDetailsNotFoundState = {
  status: "error",
  code: "checkout.notFound",
  message: "Checkout was not found for the current request.",
} as const satisfies SaveCheckoutDeliveryDetailsActionState;

export const checkoutDeliveryDetailsMutationFailureToActionState = (
  error: CheckoutMutationFailure
): SaveCheckoutDeliveryDetailsActionState => {
  switch (error._tag) {
    case "CheckoutMutationSchemaFailure":
      return {
        status: "error",
        code: "checkout.deliveryDetails.invalidInput",
        message: error.message,
      };
    case "CheckoutMutationSourceUnavailable":
      return {
        status: "error",
        code: "checkout.deliveryDetails.sourceUnavailable",
        message: error.message,
      };
    case "CheckoutVersionConflict":
      return {
        status: "error",
        code: "checkout.versionConflict",
        message: error.message,
      };
    case "CheckoutMutationProviderFailure":
      return {
        status: "error",
        code: "checkout.deliveryDetails.providerFailure",
        message: "Delivery details could not be saved. Try again.",
      };
    case "CheckoutMutationUnsupported":
      return {
        status: "error",
        code: "checkout.deliveryDetails.unsupported",
        message: "This delivery details source is not supported yet.",
      };
    default:
      error satisfies never;
      return {
        status: "error",
        code: "checkout.deliveryDetails.providerFailure",
        message: "Delivery details could not be saved. Try again.",
      };
  }
};
