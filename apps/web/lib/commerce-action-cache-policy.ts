import type {
  PlaceCheckoutOrderActionError,
  SaveCheckoutContactActionError,
  SaveCheckoutDeliveryDetailsActionError,
  SaveCheckoutPaymentOptionsActionError,
  SaveCheckoutShippingOptionsActionError,
} from "@repo/commerce/checkout";

type RevalidationResult<Error extends { readonly _tag: string }> =
  | { readonly _tag: "Success" }
  | {
      readonly _tag: "Failure";
      readonly failure: Error;
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

const shouldRevalidateFromTag = (
  result: RevalidationResult<{ readonly _tag: CheckoutErrorTag }>
) => result._tag === "Success" || REFRESH_ERROR_TAGS.has(result.failure._tag);

export const shouldRevalidateContact = (
  result: RevalidationResult<{
    readonly _tag: SaveCheckoutContactActionError["_tag"] | "InputInvalid";
  }>
) => shouldRevalidateFromTag(result);

export const shouldRevalidateDeliveryDetails = (
  result: RevalidationResult<{
    readonly _tag:
      | SaveCheckoutDeliveryDetailsActionError["_tag"]
      | "InputInvalid";
    readonly addressBookReference?: string;
  }>
) =>
  shouldRevalidateFromTag(result) ||
  (result._tag === "Failure" &&
    result.failure._tag === "CheckoutMutationProviderFailure" &&
    result.failure.addressBookReference !== undefined);

export const shouldRevalidateShippingOptions = (
  result: RevalidationResult<{
    readonly _tag:
      | SaveCheckoutShippingOptionsActionError["_tag"]
      | "InputInvalid";
  }>
) => shouldRevalidateFromTag(result);

export const shouldRevalidatePaymentOptions = (
  result: RevalidationResult<{
    readonly _tag:
      | SaveCheckoutPaymentOptionsActionError["_tag"]
      | "InputInvalid";
  }>
) => shouldRevalidateFromTag(result);

const ORDER_PLACEMENT_REFRESH_ERROR_TAGS = new Set<
  PlaceCheckoutOrderActionError["_tag"] | "InputInvalid"
>([
  "CheckoutOrderPlacementUnavailable",
  "CheckoutPaymentPreparationRefreshRequired",
  "CheckoutPaymentRejected",
]);

export const shouldRevalidatePlaceOrderFailure = (error: {
  readonly _tag: PlaceCheckoutOrderActionError["_tag"] | "InputInvalid";
}) => ORDER_PLACEMENT_REFRESH_ERROR_TAGS.has(error._tag);
