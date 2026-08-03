import type { SaveCheckoutContactActionErrorCode } from "./save-contact-state";
import type { SaveCheckoutDeliveryDetailsActionErrorCode } from "./save-delivery-details-state";

export type CheckoutActionErrorCode =
  | SaveCheckoutContactActionErrorCode
  | SaveCheckoutDeliveryDetailsActionErrorCode;

export const checkoutActionErrorMessageKey = {
  "checkout.cartMismatch": "errors.cartMismatch",
  "checkout.contact.invalidInput": "errors.contact.invalidInput",
  "checkout.contact.sourceUnavailable": "errors.contact.sourceUnavailable",
  "checkout.contact.providerFailure": "errors.contact.providerFailure",
  "checkout.contact.unsupported": "errors.contact.unsupported",
  "checkout.deliveryDetails.invalidInput":
    "errors.deliveryDetails.invalidInput",
  "checkout.deliveryDetails.addressBookEntryUnavailable":
    "errors.deliveryDetails.addressBookEntryUnavailable",
  "checkout.deliveryDetails.sourceUnavailable":
    "errors.deliveryDetails.sourceUnavailable",
  "checkout.deliveryDetails.providerFailure":
    "errors.deliveryDetails.providerFailure",
  "checkout.deliveryDetails.unsupported": "errors.deliveryDetails.unsupported",
  "checkout.notFound": "errors.notFound",
  "checkout.versionConflict": "errors.versionConflict",
} as const satisfies Record<CheckoutActionErrorCode, string>;
