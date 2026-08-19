import { createCheckoutTranslator } from "@repo/i18n/checkout-messages";
import { Option, Schema } from "effect";

import { CountryCode } from "../../domain/checkout";
import type { CheckoutViolation } from "../../domain/checkout";
import type { CommerceLocale } from "../../store";

export const localizedCountryName = (
  country: string | number | undefined,
  locale: string,
  fallback: string
) => {
  const countryCode =
    typeof country === "string"
      ? Option.getOrUndefined(Schema.decodeUnknownOption(CountryCode)(country))
      : undefined;

  if (countryCode === undefined) {
    return fallback;
  }

  return (
    new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ??
    countryCode
  );
};

export const checkoutViolationMessage = (
  locale: CommerceLocale,
  violation: CheckoutViolation
) => {
  const t = createCheckoutTranslator(locale);

  switch (violation.code) {
    case "shipping.country.unavailable": {
      const countryName = localizedCountryName(
        violation.parameters?.country,
        locale,
        t("violations.unknownCountry")
      );

      return t("violations.shippingCountryUnavailable", {
        country: countryName,
      });
    }
    case "MAX_GUEST_TOTAL_ITEMS_EXCEEDED": {
      const excessQuantity = violation.parameters?.excessQuantity;
      const maxQuantity = violation.parameters?.maxQuantity;

      if (
        typeof excessQuantity !== "number" ||
        typeof maxQuantity !== "number"
      ) {
        return t("violations.generic");
      }

      return t("violations.guestItemLimit", {
        excessQuantity,
        maxQuantity,
      });
    }
    case "INCOMPATIBLE_CART_ITEMS": {
      return t("violations.incompatibleCartItems");
    }
    case "shipping.region.unsupported":
    case "SHIPPING_ADDRESS_RESTRICTED": {
      return t("violations.shippingAddressRestricted");
    }
    case "POLICY_ERROR": {
      return t("violations.policyUnavailable");
    }
    default: {
      return t("violations.generic");
    }
  }
};
