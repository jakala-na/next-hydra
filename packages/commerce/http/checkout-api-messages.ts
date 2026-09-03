import { checkoutMessageCatalogs } from "@repo/i18n/checkout-messages";
import { locales } from "@repo/i18n/config";
import { Option, Schema } from "effect";

export type CheckoutApiErrorCode =
  | "checkout.badRequest"
  | "checkout.cartMismatch"
  | "checkout.contact.customerProfileIncomplete"
  | "checkout.contact.outcomeUnknown"
  | "checkout.contact.sourceUnavailable"
  | "checkout.deliveryDetails.addressBookEntryUnavailable"
  | "checkout.deliveryDetails.outcomeUnknown"
  | "checkout.deliveryDetails.providerFailure"
  | "checkout.deliveryDetails.sourceUnavailable"
  | "checkout.internal"
  | "checkout.notFound"
  | "checkout.paymentOptions.methodUnavailable"
  | "checkout.paymentOptions.outcomeUnknown"
  | "checkout.paymentOptions.preparationRefreshRequired"
  | "checkout.paymentOptions.providerFailure"
  | "checkout.paymentOptions.unavailable"
  | "checkout.versionConflict";

export const checkoutApiErrorMessage = (
  locale: string | undefined,
  code: CheckoutApiErrorCode
) => {
  const decodedLocale = Option.getOrElse(
    Schema.decodeUnknownOption(Schema.Literals(locales))(locale),
    () => "en-US" as const
  );
  const messages = checkoutMessageCatalogs[decodedLocale].errors;

  switch (code) {
    case "checkout.badRequest": {
      return messages.badRequest;
    }
    case "checkout.cartMismatch": {
      return messages.cartMismatch;
    }
    case "checkout.contact.customerProfileIncomplete": {
      return messages.saveContact.CheckoutCustomerProfileIncomplete;
    }
    case "checkout.contact.outcomeUnknown": {
      return messages.saveContact.CheckoutMutationOutcomeUnknown;
    }
    case "checkout.contact.sourceUnavailable": {
      return messages.saveContact.CheckoutMutationSourceUnavailable;
    }
    case "checkout.deliveryDetails.addressBookEntryUnavailable": {
      return messages.deliveryDetails.addressBookEntryUnavailable;
    }
    case "checkout.deliveryDetails.outcomeUnknown": {
      return messages.saveDeliveryDetails.CheckoutMutationOutcomeUnknown;
    }
    case "checkout.deliveryDetails.providerFailure": {
      return messages.deliveryDetails.providerFailure;
    }
    case "checkout.deliveryDetails.sourceUnavailable": {
      return messages.deliveryDetails.sourceUnavailable;
    }
    case "checkout.internal": {
      return messages.internal;
    }
    case "checkout.notFound": {
      return messages.notFound;
    }
    case "checkout.paymentOptions.methodUnavailable": {
      return messages.savePaymentOptions.CheckoutPaymentMethodUnavailable;
    }
    case "checkout.paymentOptions.outcomeUnknown": {
      return messages.savePaymentOptions.CheckoutMutationOutcomeUnknown;
    }
    case "checkout.paymentOptions.preparationRefreshRequired": {
      return messages.savePaymentOptions
        .CheckoutPaymentPreparationRefreshRequired;
    }
    case "checkout.paymentOptions.providerFailure": {
      return messages.savePaymentOptions.CheckoutMutationProviderFailure;
    }
    case "checkout.paymentOptions.unavailable": {
      return messages.paymentOptions.unavailable;
    }
    case "checkout.versionConflict": {
      return messages.versionConflict;
    }
    default: {
      const exhaustiveCode: never = code;
      return exhaustiveCode;
    }
  }
};
