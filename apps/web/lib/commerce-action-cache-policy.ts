type ContactRevalidationResult =
  | { readonly _tag: "Success" }
  | {
      readonly _tag: "Failure";
      readonly failure: {
        readonly error: {
          readonly _tag: string;
        };
      };
    };

type DeliveryRevalidationResult =
  | { readonly _tag: "Success" }
  | {
      readonly _tag: "Failure";
      readonly failure: {
        readonly error: {
          readonly _tag: string;
          readonly addressBookReference?: string;
        };
      };
    };

export const shouldRevalidateContact = (result: ContactRevalidationResult) =>
  result._tag === "Success" ||
  result.failure.error._tag === "CheckoutCartMismatch" ||
  result.failure.error._tag === "CheckoutMutationOutcomeUnknown" ||
  result.failure.error._tag === "CheckoutVersionConflict";

export const shouldRevalidateDeliveryDetails = (
  result: DeliveryRevalidationResult
) =>
  result._tag === "Success" ||
  result.failure.error._tag === "CheckoutCartMismatch" ||
  result.failure.error._tag === "CheckoutMutationOutcomeUnknown" ||
  result.failure.error._tag === "CheckoutVersionConflict" ||
  (result.failure.error._tag === "CheckoutMutationProviderFailure" &&
    result.failure.error.addressBookReference !== undefined);
