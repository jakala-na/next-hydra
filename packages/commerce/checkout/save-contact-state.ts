import type { CheckoutContactMutationFailure } from "../domain/checkout";

export type SaveCheckoutContactActionErrorCode =
  | "checkout.cartMismatch"
  | "checkout.contact.invalidInput"
  | "checkout.contact.sourceUnavailable"
  | "checkout.contact.providerFailure"
  | "checkout.contact.unsupported"
  | "checkout.notFound"
  | "checkout.versionConflict";

export type SaveCheckoutContactActionState =
  | {
      readonly status: "idle" | "success";
    }
  | {
      readonly status: "error";
      readonly code: SaveCheckoutContactActionErrorCode;
    };

export type SaveCheckoutContactAction = (
  previousState: SaveCheckoutContactActionState,
  formData: FormData
) => Promise<SaveCheckoutContactActionState>;

export const initialSaveCheckoutContactActionState = {
  status: "idle",
} as const satisfies SaveCheckoutContactActionState;

export const saveCheckoutContactActionSuccess = {
  status: "success",
} as const satisfies SaveCheckoutContactActionState;

export const invalidCheckoutContactFormState = {
  status: "error",
  code: "checkout.contact.invalidInput",
} as const satisfies SaveCheckoutContactActionState;

export const checkoutContactNotFoundState = {
  status: "error",
  code: "checkout.notFound",
} as const satisfies SaveCheckoutContactActionState;

export const checkoutMutationFailureToActionState = (
  error: CheckoutContactMutationFailure
): SaveCheckoutContactActionState => {
  switch (error._tag) {
    case "CheckoutCartMismatch":
      return {
        status: "error",
        code: "checkout.cartMismatch",
      };
    case "CheckoutMutationSchemaFailure":
      return {
        status: "error",
        code: "checkout.contact.invalidInput",
      };
    case "CheckoutMutationSourceUnavailable":
      return {
        status: "error",
        code: "checkout.contact.sourceUnavailable",
      };
    case "CheckoutVersionConflict":
      return {
        status: "error",
        code: "checkout.versionConflict",
      };
    case "CheckoutMutationProviderFailure":
      return {
        status: "error",
        code: "checkout.contact.providerFailure",
      };
    case "CheckoutMutationUnsupported":
      return {
        status: "error",
        code: "checkout.contact.unsupported",
      };
    default:
      error satisfies never;
      return {
        status: "error",
        code: "checkout.contact.providerFailure",
      };
  }
};
