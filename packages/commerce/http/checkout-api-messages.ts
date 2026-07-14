import { checkoutMessageCatalogs } from "@repo/i18n/checkout-messages";
import type { SupportedLocale } from "@repo/i18n/config";
import { Option, Schema } from "effect";
import { CheckoutLocale } from "../domain/checkout";

export type CheckoutApiErrorCode =
  | "checkout.badRequest"
  | "checkout.internal"
  | "checkout.notFound"
  | "checkout.versionConflict";

export const checkoutApiErrorMessage = (
  locale: string | undefined,
  code: CheckoutApiErrorCode
) => {
  const decodedLocale = Option.getOrElse(
    Schema.decodeUnknownOption(CheckoutLocale)(locale),
    () => CheckoutLocale.make("en-US")
  );
  const messages =
    checkoutMessageCatalogs[decodedLocale as SupportedLocale].errors;

  switch (code) {
    case "checkout.badRequest":
      return messages.badRequest;
    case "checkout.internal":
      return messages.internal;
    case "checkout.notFound":
      return messages.notFound;
    case "checkout.versionConflict":
      return messages.versionConflict;
    default:
      code satisfies never;
      return messages.internal;
  }
};
