import { checkoutMessageCatalogs } from "@repo/i18n/checkout-messages";
import type { SupportedLocale } from "@repo/i18n/config";
import { Option, Schema } from "effect";

import { CommerceLocale } from "../store";

export type CheckoutApiErrorCode =
  | "checkout.badRequest"
  | "checkout.cartMismatch"
  | "checkout.contact.invalidInput"
  | "checkout.contact.sourceUnavailable"
  | "checkout.deliveryDetails.addressBookEntryUnavailable"
  | "checkout.deliveryDetails.invalidInput"
  | "checkout.deliveryDetails.providerFailure"
  | "checkout.deliveryDetails.sourceUnavailable"
  | "checkout.internal"
  | "checkout.notFound"
  | "checkout.versionConflict";

export const checkoutApiErrorMessage = (
  locale: string | undefined,
  code: CheckoutApiErrorCode
) => {
  const decodedLocale = Option.getOrElse(
    Schema.decodeUnknownOption(CommerceLocale)(locale),
    () => CommerceLocale.make("en-US")
  );
  const messages =
    checkoutMessageCatalogs[decodedLocale as SupportedLocale].errors;

  switch (code) {
    case "checkout.badRequest":
      return messages.badRequest;
    case "checkout.cartMismatch":
      return messages.cartMismatch;
    case "checkout.contact.invalidInput":
      return messages.saveContact.CheckoutMutationSchemaFailure;
    case "checkout.contact.sourceUnavailable":
      return messages.saveContact.CheckoutMutationSourceUnavailable;
    case "checkout.deliveryDetails.addressBookEntryUnavailable":
      return messages.deliveryDetails.addressBookEntryUnavailable;
    case "checkout.deliveryDetails.invalidInput":
      return messages.deliveryDetails.invalidInput;
    case "checkout.deliveryDetails.providerFailure":
      return messages.deliveryDetails.providerFailure;
    case "checkout.deliveryDetails.sourceUnavailable":
      return messages.deliveryDetails.sourceUnavailable;
    case "checkout.internal":
      return messages.internal;
    case "checkout.notFound":
      return messages.notFound;
    case "checkout.versionConflict":
      return messages.versionConflict;
    default: {
      const exhaustiveCode: never = code;
      return exhaustiveCode;
    }
  }
};
