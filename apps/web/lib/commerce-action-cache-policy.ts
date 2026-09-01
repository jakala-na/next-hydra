import type {
  SaveCheckoutContactActionError,
  SaveCheckoutDeliveryDetailsActionError,
  SaveCheckoutPaymentOptionsActionError,
  SaveCheckoutShippingOptionsActionError,
} from "@repo/commerce/checkout";

type RevalidationResult<Tag extends string> =
  | { readonly _tag: "Success" }
  | {
      readonly _tag: "Failure";
      readonly failure: {
        readonly error: {
          readonly _tag: Tag;
        };
      };
    };

type CheckoutError =
  | SaveCheckoutContactActionError
  | SaveCheckoutDeliveryDetailsActionError
  | SaveCheckoutPaymentOptionsActionError
  | SaveCheckoutShippingOptionsActionError;
type CheckoutErrorTag = CheckoutError["_tag"] | "InputInvalid";

const REFRESH_ERROR_TAGS = new Set<CheckoutErrorTag>([
  "CheckoutCartMismatch",
  "CheckoutMutationOutcomeUnknown",
  "CheckoutPaymentMethodUnavailable",
  "CheckoutPaymentOptionsUnavailable",
  "CheckoutPaymentPreparationRefreshRequired",
  "CheckoutShippingOptionsRefreshRequired",
  "CheckoutShippingSelectionUnavailable",
  "CheckoutVersionConflict",
]);

const shouldRevalidateFromTag = <Tag extends CheckoutErrorTag>(
  result: RevalidationResult<Tag>
) =>
  result._tag === "Success" ||
  REFRESH_ERROR_TAGS.has(result.failure.error._tag);

export const shouldRevalidateContact = (
  result: RevalidationResult<
    SaveCheckoutContactActionError["_tag"] | "InputInvalid"
  >
) => shouldRevalidateFromTag(result);

export const shouldRevalidateDeliveryDetails = (
  result: RevalidationResult<
    SaveCheckoutDeliveryDetailsActionError["_tag"] | "InputInvalid"
  > & {
    readonly failure?: {
      readonly error: {
        readonly addressBookReference?: string;
      };
    };
  }
) =>
  shouldRevalidateFromTag(result) ||
  (result._tag === "Failure" &&
    result.failure.error._tag === "CheckoutMutationProviderFailure" &&
    result.failure.error.addressBookReference !== undefined);

export const shouldRevalidateShippingOptions = (
  result: RevalidationResult<
    SaveCheckoutShippingOptionsActionError["_tag"] | "InputInvalid"
  >
) => shouldRevalidateFromTag(result);

export const shouldRevalidatePaymentOptions = (
  result: RevalidationResult<
    SaveCheckoutPaymentOptionsActionError["_tag"] | "InputInvalid"
  >
) => shouldRevalidateFromTag(result);
