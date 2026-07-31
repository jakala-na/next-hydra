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
  switch (error._tag) {
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
    case "CheckoutVersionConflict":
      return {
        status: "error",
        code: "checkout.versionConflict",
      };
    case "CheckoutMutationProviderFailure":
      return {
        status: "error",
        code: "checkout.deliveryDetails.providerFailure",
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
