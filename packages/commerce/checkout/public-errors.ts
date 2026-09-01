import { ErrorIssue, definePublicError } from "@repo/errors";
import { Schema } from "effect";

import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import { CheckoutCustomerProfileField } from "../domain/checkout";
import type {
  CheckoutProviderFailure,
  CheckoutUnavailable,
} from "../domain/checkout";
import {
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import { checkoutApiErrorMessage } from "../http/checkout-api-messages";
import type { CheckoutApiErrorCode } from "../http/checkout-api-messages";
import type {
  CheckoutSaveContactFailure,
  CheckoutSaveDeliveryDetailsFailure,
  CheckoutSaveShippingOptionsFailure,
} from "../lib/checkout/checkout-session";
import type { NextCommerceRequestError } from "../runtime";

const PublicCheckoutUnavailable = definePublicError({
  category: "not_found",
  code: "checkout.notFound",
  fields: {
    reason: Schema.Literals(["noCart", "emptyCart", "inaccessibleCart"]),
  },
  recovery: "refresh",
  status: 404,
  tag: "CheckoutUnavailable",
});

const PublicCheckoutCartMismatch = definePublicError({
  category: "conflict",
  code: "checkout.cartMismatch",
  fields: {
    currentCartId: CartId,
    submittedCartId: CartId,
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutCartMismatch",
});

const PublicCheckoutContactVersionConflict = definePublicError({
  category: "conflict",
  code: "checkout.versionConflict",
  fields: {
    cartId: CartId,
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutVersionConflict",
});

const PublicCheckoutDeliveryVersionConflict = definePublicError({
  category: "conflict",
  code: "checkout.versionConflict",
  fields: {
    addressBookReference: Schema.optional(AddressBookReference),
    cartId: CartId,
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutVersionConflict",
});

const PublicCheckoutContactOutcomeUnknown = definePublicError({
  category: "unavailable",
  code: "checkout.contact.outcomeUnknown",
  fields: {
    cartId: Schema.optional(CartId),
  },
  recovery: "refresh",
  status: 503,
  tag: "CheckoutMutationOutcomeUnknown",
});

const PublicCheckoutDeliveryOutcomeUnknown = definePublicError({
  category: "unavailable",
  code: "checkout.deliveryDetails.outcomeUnknown",
  fields: {
    addressBookReference: Schema.optional(AddressBookReference),
    cartId: Schema.optional(CartId),
  },
  recovery: "refresh",
  status: 503,
  tag: "CheckoutMutationOutcomeUnknown",
});

const PublicCheckoutAddressBookEntryUnavailable = definePublicError({
  category: "conflict",
  code: "checkout.deliveryDetails.addressBookEntryUnavailable",
  fields: {
    addressBookReference: AddressBookReference,
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutMutationAddressBookEntryUnavailable",
});

const PublicCheckoutDeliveryProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.deliveryDetails.providerFailure",
  fields: {
    addressBookReference: Schema.optional(AddressBookReference),
  },
  recovery: "retry",
  status: 503,
  tag: "CheckoutMutationProviderFailure",
});

const PublicCheckoutContactProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.internal",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutMutationProviderFailure",
});

const PublicCheckoutShippingSelectionUnavailable = definePublicError({
  category: "conflict",
  code: "checkout.shippingOptions.selectionUnavailable",
  fields: {
    planReference: DeliveryPlanReference,
    quoteReference: DeliveryPlanQuoteReference,
    shippingOptionReference: Schema.optional(ShippingOptionReference),
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutShippingSelectionUnavailable",
});

const PublicCheckoutShippingOptionsRefreshRequired = definePublicError({
  category: "unavailable",
  code: "checkout.shippingOptions.refreshRequired",
  fields: { cartId: CartId },
  recovery: "refresh",
  status: 503,
  tag: "CheckoutShippingOptionsRefreshRequired",
});

const PublicCheckoutShippingOutcomeUnknown = definePublicError({
  category: "unavailable",
  code: "checkout.shippingOptions.outcomeUnknown",
  fields: { cartId: Schema.optional(CartId) },
  recovery: "refresh",
  status: 503,
  tag: "CheckoutMutationOutcomeUnknown",
});

const PublicCheckoutShippingProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.shippingOptions.providerFailure",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutMutationProviderFailure",
});

const PublicCheckoutProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.internal",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutProviderFailure",
});

export type CheckoutSaveContactExpectedFailure = Exclude<
  CheckoutSaveContactFailure,
  { readonly _tag: "CheckoutMutationUnsupported" }
>;

export type CheckoutSaveDeliveryDetailsExpectedFailure = Exclude<
  CheckoutSaveDeliveryDetailsFailure,
  { readonly _tag: "CheckoutMutationUnsupported" }
>;

export type CheckoutSaveShippingOptionsExpectedFailure = Exclude<
  CheckoutSaveShippingOptionsFailure,
  { readonly _tag: "CheckoutMutationUnsupported" }
>;

const PublicCommerceRequestContextNotFound = definePublicError({
  category: "not_found",
  code: "checkout.notFound",
  fields: {
    reason: Schema.Literals([
      "noPrincipal",
      "noCustomerMapping",
      "noBuyingContext",
    ]),
  },
  recovery: "refresh",
  status: 404,
  tag: "CommerceRequestContextNotFound",
});

const PublicCommerceAccountUnavailable = definePublicError({
  category: "unavailable",
  code: "checkout.internal",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CommerceAccountUnavailable",
});

const CheckoutAuthenticationUnavailableDefinition = definePublicError({
  category: "unavailable",
  code: "checkout.internal",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutAuthenticationUnavailable",
});

export const CheckoutAuthenticationUnavailable =
  CheckoutAuthenticationUnavailableDefinition.schema;
export type CheckoutAuthenticationUnavailable =
  typeof CheckoutAuthenticationUnavailable.Type;
export const makeCheckoutAuthenticationUnavailable =
  CheckoutAuthenticationUnavailableDefinition.make;

const CheckoutUnauthenticatedDefinition = definePublicError({
  category: "unauthenticated",
  code: "checkout.unauthenticated",
  fields: {},
  recovery: "reauthenticate",
  status: 401,
  tag: "CheckoutUnauthenticated",
});
export const CheckoutUnauthenticated = CheckoutUnauthenticatedDefinition.schema;
export type CheckoutUnauthenticated = typeof CheckoutUnauthenticated.Type;
export const makeCheckoutUnauthenticated =
  CheckoutUnauthenticatedDefinition.make;

const contactInputFailure = definePublicError({
  category: "bad_input",
  code: "checkout.contact.invalidInput",
  fields: {
    issues: Schema.NonEmptyArray(ErrorIssue),
  },
  recovery: "fix_input",
  status: 400,
  tag: "CheckoutMutationSchemaFailure",
});

const contactSourceFailure = definePublicError({
  category: "bad_input",
  code: "checkout.contact.sourceUnavailable",
  fields: {
    source: Schema.String,
  },
  recovery: "fix_input",
  status: 400,
  tag: "CheckoutMutationSourceUnavailable",
});

const customerProfileIncompleteFailure = definePublicError({
  category: "bad_input",
  code: "checkout.contact.customerProfileIncomplete",
  fields: {
    missingFields: Schema.NonEmptyArray(CheckoutCustomerProfileField).check(
      Schema.isUnique()
    ),
  },
  recovery: "fix_input",
  status: 422,
  tag: "CheckoutCustomerProfileIncomplete",
});

const deliveryInputFailure = definePublicError({
  category: "bad_input",
  code: "checkout.deliveryDetails.invalidInput",
  fields: {
    issues: Schema.NonEmptyArray(ErrorIssue),
  },
  recovery: "fix_input",
  status: 400,
  tag: "CheckoutMutationSchemaFailure",
});

const shippingOptionsInputFailure = definePublicError({
  category: "bad_input",
  code: "checkout.shippingOptions.invalidInput",
  fields: {
    issues: Schema.NonEmptyArray(ErrorIssue),
  },
  recovery: "fix_input",
  status: 400,
  tag: "CheckoutMutationSchemaFailure",
});

const deliverySourceFailure = definePublicError({
  category: "bad_input",
  code: "checkout.deliveryDetails.sourceUnavailable",
  fields: {
    source: Schema.String,
  },
  recovery: "fix_input",
  status: 400,
  tag: "CheckoutMutationSourceUnavailable",
});

const message = (locale: string, code: CheckoutApiErrorCode) =>
  checkoutApiErrorMessage(locale, code);

const absurd = (error: never): never => {
  throw new Error(`Unexpected checkout failure: ${String(error)}`);
};

const publicIssues = (
  issues: readonly { readonly path: string }[],
  issueMessage: string
): readonly [ErrorIssue, ...ErrorIssue[]] => {
  const [first, ...remaining] = issues;
  const toIssue = ({ path }: { readonly path: string }) =>
    new ErrorIssue({ message: issueMessage, path: [path] });

  return first === undefined
    ? [new ErrorIssue({ message: issueMessage, path: [] })]
    : [toIssue(first), ...remaining.map(toIssue)];
};

export const projectCheckoutRequestFailure = (
  error: NextCommerceRequestError,
  locale: string
) => {
  switch (error._tag) {
    case "CommerceRequestContextNotFound": {
      return PublicCommerceRequestContextNotFound.make({
        message: message(locale, "checkout.notFound"),
        reason: error.reason,
      });
    }
    case "CommerceAccountUnavailable": {
      return PublicCommerceAccountUnavailable.make({
        message: message(locale, "checkout.internal"),
      });
    }
    default: {
      return absurd(error);
    }
  }
};

export const CheckoutCurrentOperationPublicErrors = [
  PublicCheckoutUnavailable.schema,
  PublicCheckoutProviderFailure.schema,
] as const;
export const CheckoutCurrentOperationPublicError = Schema.Union(
  CheckoutCurrentOperationPublicErrors
);
export type CheckoutCurrentOperationPublicError =
  typeof CheckoutCurrentOperationPublicError.Type;

export const projectCheckoutReadFailure = (
  error: CheckoutUnavailable | CheckoutProviderFailure,
  locale: string
): CheckoutCurrentOperationPublicError => {
  switch (error._tag) {
    case "CheckoutUnavailable": {
      return PublicCheckoutUnavailable.make({
        message: message(locale, "checkout.notFound"),
        reason: error.reason,
      });
    }
    case "CheckoutProviderFailure": {
      return PublicCheckoutProviderFailure.make({
        message: message(locale, "checkout.internal"),
      });
    }
    default: {
      return absurd(error);
    }
  }
};

export const SaveCheckoutContactOperationPublicErrors = [
  contactInputFailure.schema,
  contactSourceFailure.schema,
  customerProfileIncompleteFailure.schema,
  PublicCheckoutCartMismatch.schema,
  PublicCheckoutContactVersionConflict.schema,
  PublicCheckoutContactOutcomeUnknown.schema,
  PublicCheckoutContactProviderFailure.schema,
  PublicCheckoutUnavailable.schema,
] as const;
export const SaveCheckoutContactOperationPublicError = Schema.Union(
  SaveCheckoutContactOperationPublicErrors
);
export type SaveCheckoutContactOperationPublicError =
  typeof SaveCheckoutContactOperationPublicError.Type;
export const CheckoutRequestPublicErrors = [
  PublicCommerceRequestContextNotFound.schema,
  PublicCommerceAccountUnavailable.schema,
] as const;
export const SaveCheckoutContactPublicErrors = [
  ...SaveCheckoutContactOperationPublicErrors,
  ...CheckoutRequestPublicErrors,
] as const;
export const SaveCheckoutContactPublicError = Schema.Union(
  SaveCheckoutContactPublicErrors
);
export type SaveCheckoutContactPublicError =
  typeof SaveCheckoutContactPublicError.Type;

export function projectSaveCheckoutContactFailure(
  error: CheckoutSaveContactExpectedFailure,
  locale: string
): SaveCheckoutContactOperationPublicError;
export function projectSaveCheckoutContactFailure(
  error: CheckoutSaveContactExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutContactPublicError;
export function projectSaveCheckoutContactFailure(
  error: CheckoutSaveContactExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutContactPublicError {
  switch (error._tag) {
    case "CheckoutMutationSchemaFailure": {
      const publicMessage = message(locale, "checkout.contact.invalidInput");
      return contactInputFailure.make({
        issues: publicIssues(error.issues, publicMessage),
        message: publicMessage,
      });
    }
    case "CheckoutMutationSourceUnavailable": {
      return contactSourceFailure.make({
        message: message(locale, "checkout.contact.sourceUnavailable"),
        source: error.source,
      });
    }
    case "CheckoutCustomerProfileIncomplete": {
      return customerProfileIncompleteFailure.make({
        message: message(locale, "checkout.contact.customerProfileIncomplete"),
        missingFields: error.missingFields,
      });
    }
    case "CheckoutCartMismatch": {
      return PublicCheckoutCartMismatch.make({
        currentCartId: error.currentCartId,
        message: message(locale, "checkout.cartMismatch"),
        submittedCartId: error.submittedCartId,
      });
    }
    case "CheckoutVersionConflict": {
      return PublicCheckoutContactVersionConflict.make({
        cartId: error.cartId,
        message: message(locale, "checkout.versionConflict"),
      });
    }
    case "CheckoutMutationOutcomeUnknown": {
      return PublicCheckoutContactOutcomeUnknown.make({
        message: message(locale, "checkout.contact.outcomeUnknown"),
        ...(error.cartId === undefined ? {} : { cartId: error.cartId }),
      });
    }
    case "CheckoutMutationProviderFailure": {
      return PublicCheckoutContactProviderFailure.make({
        message: message(locale, "checkout.internal"),
      });
    }
    case "CheckoutUnavailable": {
      return PublicCheckoutUnavailable.make({
        message: message(locale, "checkout.notFound"),
        reason: error.reason,
      });
    }
    case "CommerceAccountUnavailable":
    case "CommerceRequestContextNotFound": {
      return projectCheckoutRequestFailure(error, locale);
    }
    default: {
      return absurd(error);
    }
  }
}

export const SaveCheckoutDeliveryDetailsOperationPublicErrors = [
  deliveryInputFailure.schema,
  deliverySourceFailure.schema,
  PublicCheckoutAddressBookEntryUnavailable.schema,
  PublicCheckoutCartMismatch.schema,
  PublicCheckoutDeliveryVersionConflict.schema,
  PublicCheckoutDeliveryOutcomeUnknown.schema,
  PublicCheckoutDeliveryProviderFailure.schema,
  PublicCheckoutUnavailable.schema,
] as const;
export const SaveCheckoutDeliveryDetailsOperationPublicError = Schema.Union(
  SaveCheckoutDeliveryDetailsOperationPublicErrors
);
export type SaveCheckoutDeliveryDetailsOperationPublicError =
  typeof SaveCheckoutDeliveryDetailsOperationPublicError.Type;
export const SaveCheckoutDeliveryDetailsPublicErrors = [
  ...SaveCheckoutDeliveryDetailsOperationPublicErrors,
  ...CheckoutRequestPublicErrors,
] as const;
export const SaveCheckoutDeliveryDetailsPublicError = Schema.Union(
  SaveCheckoutDeliveryDetailsPublicErrors
);
export type SaveCheckoutDeliveryDetailsPublicError =
  typeof SaveCheckoutDeliveryDetailsPublicError.Type;

export function projectSaveCheckoutDeliveryDetailsFailure(
  error: CheckoutSaveDeliveryDetailsExpectedFailure,
  locale: string
): SaveCheckoutDeliveryDetailsOperationPublicError;
export function projectSaveCheckoutDeliveryDetailsFailure(
  error: CheckoutSaveDeliveryDetailsExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutDeliveryDetailsPublicError;
export function projectSaveCheckoutDeliveryDetailsFailure(
  error: CheckoutSaveDeliveryDetailsExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutDeliveryDetailsPublicError {
  switch (error._tag) {
    case "CheckoutMutationSchemaFailure": {
      const publicMessage = message(
        locale,
        "checkout.deliveryDetails.invalidInput"
      );
      return deliveryInputFailure.make({
        issues: publicIssues(error.issues, publicMessage),
        message: publicMessage,
      });
    }
    case "CheckoutMutationSourceUnavailable": {
      return deliverySourceFailure.make({
        message: message(locale, "checkout.deliveryDetails.sourceUnavailable"),
        source: error.source,
      });
    }
    case "CheckoutMutationAddressBookEntryUnavailable": {
      return PublicCheckoutAddressBookEntryUnavailable.make({
        addressBookReference: error.addressBookReference,
        message: message(
          locale,
          "checkout.deliveryDetails.addressBookEntryUnavailable"
        ),
      });
    }
    case "CheckoutCartMismatch": {
      return PublicCheckoutCartMismatch.make({
        currentCartId: error.currentCartId,
        message: message(locale, "checkout.cartMismatch"),
        submittedCartId: error.submittedCartId,
      });
    }
    case "CheckoutVersionConflict": {
      return PublicCheckoutDeliveryVersionConflict.make({
        cartId: error.cartId,
        message: message(locale, "checkout.versionConflict"),
        ...(error.addressBookReference === undefined
          ? {}
          : { addressBookReference: error.addressBookReference }),
      });
    }
    case "CheckoutMutationOutcomeUnknown": {
      return PublicCheckoutDeliveryOutcomeUnknown.make({
        message: message(locale, "checkout.deliveryDetails.outcomeUnknown"),
        ...(error.addressBookReference === undefined
          ? {}
          : { addressBookReference: error.addressBookReference }),
        ...(error.cartId === undefined ? {} : { cartId: error.cartId }),
      });
    }
    case "CheckoutMutationProviderFailure": {
      return PublicCheckoutDeliveryProviderFailure.make({
        message: message(locale, "checkout.deliveryDetails.providerFailure"),
        ...(error.addressBookReference === undefined
          ? {}
          : { addressBookReference: error.addressBookReference }),
      });
    }
    case "CheckoutUnavailable": {
      return PublicCheckoutUnavailable.make({
        message: message(locale, "checkout.notFound"),
        reason: error.reason,
      });
    }
    case "CommerceAccountUnavailable":
    case "CommerceRequestContextNotFound": {
      return projectCheckoutRequestFailure(error, locale);
    }
    default: {
      return absurd(error);
    }
  }
}

export const SaveCheckoutShippingOptionsOperationPublicErrors = [
  shippingOptionsInputFailure.schema,
  PublicCheckoutShippingSelectionUnavailable.schema,
  PublicCheckoutShippingOptionsRefreshRequired.schema,
  PublicCheckoutCartMismatch.schema,
  PublicCheckoutContactVersionConflict.schema,
  PublicCheckoutShippingOutcomeUnknown.schema,
  PublicCheckoutShippingProviderFailure.schema,
  PublicCheckoutUnavailable.schema,
] as const;
export const SaveCheckoutShippingOptionsOperationPublicError = Schema.Union(
  SaveCheckoutShippingOptionsOperationPublicErrors
);
export type SaveCheckoutShippingOptionsOperationPublicError =
  typeof SaveCheckoutShippingOptionsOperationPublicError.Type;
export const SaveCheckoutShippingOptionsPublicError = Schema.Union([
  ...SaveCheckoutShippingOptionsOperationPublicErrors,
  ...CheckoutRequestPublicErrors,
]);
export type SaveCheckoutShippingOptionsPublicError =
  typeof SaveCheckoutShippingOptionsPublicError.Type;

export function projectSaveCheckoutShippingOptionsFailure(
  error: CheckoutSaveShippingOptionsExpectedFailure,
  locale: string
): SaveCheckoutShippingOptionsOperationPublicError;
export function projectSaveCheckoutShippingOptionsFailure(
  error: CheckoutSaveShippingOptionsExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutShippingOptionsPublicError;
export function projectSaveCheckoutShippingOptionsFailure(
  error: CheckoutSaveShippingOptionsExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutShippingOptionsPublicError {
  switch (error._tag) {
    case "CheckoutMutationSchemaFailure": {
      const publicMessage = message(locale, "checkout.badRequest");
      return shippingOptionsInputFailure.make({
        issues: publicIssues(error.issues, publicMessage),
        message: publicMessage,
      });
    }
    case "CheckoutShippingSelectionUnavailable": {
      const failure = {
        message: message(locale, "checkout.versionConflict"),
        planReference: error.planReference,
        quoteReference: error.quoteReference,
      };
      return error.shippingOptionReference === undefined
        ? PublicCheckoutShippingSelectionUnavailable.make(failure)
        : PublicCheckoutShippingSelectionUnavailable.make({
            ...failure,
            shippingOptionReference: error.shippingOptionReference,
          });
    }
    case "CheckoutShippingOptionsRefreshRequired": {
      return PublicCheckoutShippingOptionsRefreshRequired.make({
        cartId: error.cartId,
        message: message(locale, "checkout.internal"),
      });
    }
    case "CheckoutCartMismatch": {
      return PublicCheckoutCartMismatch.make({
        currentCartId: error.currentCartId,
        message: message(locale, "checkout.cartMismatch"),
        submittedCartId: error.submittedCartId,
      });
    }
    case "CheckoutVersionConflict": {
      return PublicCheckoutContactVersionConflict.make({
        cartId: error.cartId,
        message: message(locale, "checkout.versionConflict"),
      });
    }
    case "CheckoutMutationOutcomeUnknown": {
      const failure = {
        message: message(locale, "checkout.internal"),
      };
      return error.cartId === undefined
        ? PublicCheckoutShippingOutcomeUnknown.make(failure)
        : PublicCheckoutShippingOutcomeUnknown.make({
            ...failure,
            cartId: error.cartId,
          });
    }
    case "CheckoutMutationProviderFailure": {
      return PublicCheckoutShippingProviderFailure.make({
        message: message(locale, "checkout.internal"),
      });
    }
    case "CheckoutUnavailable": {
      return PublicCheckoutUnavailable.make({
        message: message(locale, "checkout.notFound"),
        reason: error.reason,
      });
    }
    case "CommerceAccountUnavailable":
    case "CommerceRequestContextNotFound": {
      return projectCheckoutRequestFailure(error, locale);
    }
    default: {
      return absurd(error);
    }
  }
}
