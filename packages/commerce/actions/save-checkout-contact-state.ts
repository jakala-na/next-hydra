import type { CheckoutMutationFailure } from "../domain/checkout";

export type SaveCheckoutContactActionErrorCode =
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
      readonly message: string;
    };

export const initialSaveCheckoutContactActionState = {
  status: "idle",
} as const satisfies SaveCheckoutContactActionState;

export const saveCheckoutContactActionSuccess = {
  status: "success",
} as const satisfies SaveCheckoutContactActionState;

export const invalidCheckoutContactFormState = {
  status: "error",
  code: "checkout.contact.invalidInput",
  message: "Enter an email, first name, and last name.",
} as const satisfies SaveCheckoutContactActionState;

export const checkoutContactNotFoundState = {
  status: "error",
  code: "checkout.notFound",
  message: "Checkout was not found for the current request.",
} as const satisfies SaveCheckoutContactActionState;

export const checkoutMutationFailureToActionState = (
  error: CheckoutMutationFailure
): SaveCheckoutContactActionState => {
  switch (error._tag) {
    case "CheckoutMutationSchemaFailure":
      return {
        status: "error",
        code: "checkout.contact.invalidInput",
        message: error.message,
      };
    case "CheckoutMutationSourceUnavailable":
      return {
        status: "error",
        code: "checkout.contact.sourceUnavailable",
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
        code: "checkout.contact.providerFailure",
        message: "Contact could not be saved. Try again.",
      };
    case "CheckoutMutationUnsupported":
      return {
        status: "error",
        code: "checkout.contact.unsupported",
        message: "This contact source is not supported yet.",
      };
    default:
      error satisfies never;
      return {
        status: "error",
        code: "checkout.contact.providerFailure",
        message: "Contact could not be saved. Try again.",
      };
  }
};
