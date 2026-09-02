import { ErrorIssue, definePublicError } from "@repo/errors";
import { PaymentMethod, PreparedPaymentReference } from "@repo/payments";
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
import { OrderRejectionReason } from "../domain/order";
import { checkoutApiErrorMessage } from "../http/checkout-api-messages";
import type { CheckoutApiErrorCode } from "../http/checkout-api-messages";
import type {
  CheckoutSaveContactFailure,
  CheckoutSaveDeliveryDetailsFailure,
  CheckoutPreparePaymentOptionsFailure,
  CheckoutSavePaymentOptionsFailure,
  CheckoutSaveShippingOptionsFailure,
  CheckoutPlaceOrderFailure,
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

export type CheckoutSavePaymentOptionsExpectedFailure = Exclude<
  CheckoutSavePaymentOptionsFailure,
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

const paymentOptionsInputFailure = definePublicError({
  category: "bad_input",
  code: "checkout.paymentOptions.invalidInput",
  fields: { issues: Schema.NonEmptyArray(ErrorIssue) },
  recovery: "fix_input",
  status: 400,
  tag: "CheckoutMutationSchemaFailure",
});

const PublicCheckoutPaymentMethodUnavailable = definePublicError({
  category: "conflict",
  code: "checkout.paymentOptions.methodUnavailable",
  fields: {
    method: PaymentMethod,
    reason: Schema.Literals(["insufficientAvailableCredit", "notEligible"]),
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutPaymentMethodUnavailable",
});

const PublicCheckoutPaymentPreparationRefreshRequired = definePublicError({
  category: "conflict",
  code: "checkout.paymentOptions.preparationRefreshRequired",
  fields: {
    preparationReference: PreparedPaymentReference,
    reason: Schema.Literals([
      "amountChanged",
      "authorizationReleased",
      "notFound",
      "confirmationUnavailable",
    ]),
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutPaymentPreparationRefreshRequired",
});

const PublicCheckoutPaymentOutcomeUnknown = definePublicError({
  category: "unavailable",
  code: "checkout.paymentOptions.outcomeUnknown",
  fields: { cartId: Schema.optional(CartId) },
  recovery: "refresh",
  status: 503,
  tag: "CheckoutMutationOutcomeUnknown",
});

const PublicCheckoutPaymentProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.paymentOptions.providerFailure",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutMutationProviderFailure",
});

const PublicCheckoutPaymentOptionsUnavailable = definePublicError({
  category: "conflict",
  code: "checkout.paymentOptions.unavailable",
  fields: {
    reason: Schema.Literals([
      "contactIncomplete",
      "deliveryDetailsIncomplete",
      "shippingOptionsIncomplete",
    ]),
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutPaymentOptionsUnavailable",
});

const PublicCheckoutPaymentOptionsReadProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.paymentOptions.providerFailure",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutProviderFailure",
});

const PublicCheckoutOrderPlacementUnavailable = definePublicError({
  category: "conflict",
  code: "checkout.orderPlacement.unavailable",
  fields: {
    reason: Schema.Literals([
      "checkoutIncomplete",
      "paymentChanged",
      "paymentMissing",
      "policyViolation",
    ]),
  },
  recovery: "refresh",
  status: 409,
  tag: "CheckoutOrderPlacementUnavailable",
});

const PublicCheckoutPaymentRejected = definePublicError({
  category: "conflict",
  code: "checkout.orderPlacement.paymentRejected",
  fields: { operation: Schema.Literals(["authorize", "capture"]) },
  recovery: "fix_input",
  status: 422,
  tag: "CheckoutPaymentRejected",
});

const PublicCheckoutOrderRejected = definePublicError({
  category: "conflict",
  code: "checkout.orderPlacement.rejected",
  fields: { reason: OrderRejectionReason },
  recovery: "refresh",
  status: 409,
  tag: "OrderPlacementRejected",
});

const PublicCheckoutOrderProviderFailure = definePublicError({
  category: "unavailable",
  code: "checkout.orderPlacement.providerFailure",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CheckoutProviderFailure",
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

export const PrepareCheckoutPaymentOptionsOperationPublicErrors = [
  PublicCheckoutPaymentOptionsUnavailable.schema,
  PublicCheckoutPaymentOptionsReadProviderFailure.schema,
  PublicCheckoutUnavailable.schema,
] as const;
export const PrepareCheckoutPaymentOptionsOperationPublicError = Schema.Union(
  PrepareCheckoutPaymentOptionsOperationPublicErrors
);
export type PrepareCheckoutPaymentOptionsOperationPublicError =
  typeof PrepareCheckoutPaymentOptionsOperationPublicError.Type;

export const projectPrepareCheckoutPaymentOptionsFailure = (
  error: CheckoutPreparePaymentOptionsFailure,
  locale: string
): PrepareCheckoutPaymentOptionsOperationPublicError => {
  switch (error._tag) {
    case "CheckoutPaymentOptionsUnavailable": {
      return PublicCheckoutPaymentOptionsUnavailable.make({
        message: message(locale, "checkout.paymentOptions.unavailable"),
        reason: error.reason,
      });
    }
    case "CheckoutProviderFailure": {
      return PublicCheckoutPaymentOptionsReadProviderFailure.make({
        message: message(locale, "checkout.paymentOptions.providerFailure"),
      });
    }
    case "CheckoutUnavailable": {
      return PublicCheckoutUnavailable.make({
        message: message(locale, "checkout.notFound"),
        reason: error.reason,
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
      const publicMessage = message(locale, "checkout.contact.outcomeUnknown");
      if (error.cartId === undefined) {
        return PublicCheckoutContactOutcomeUnknown.make({
          message: publicMessage,
        });
      }
      return PublicCheckoutContactOutcomeUnknown.make({
        cartId: error.cartId,
        message: publicMessage,
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
      const publicMessage = message(locale, "checkout.versionConflict");
      if (error.addressBookReference === undefined) {
        return PublicCheckoutDeliveryVersionConflict.make({
          cartId: error.cartId,
          message: publicMessage,
        });
      }
      return PublicCheckoutDeliveryVersionConflict.make({
        addressBookReference: error.addressBookReference,
        cartId: error.cartId,
        message: publicMessage,
      });
    }
    case "CheckoutMutationOutcomeUnknown": {
      const publicMessage = message(
        locale,
        "checkout.deliveryDetails.outcomeUnknown"
      );
      if (
        error.addressBookReference === undefined &&
        error.cartId === undefined
      ) {
        return PublicCheckoutDeliveryOutcomeUnknown.make({
          message: publicMessage,
        });
      }
      if (error.addressBookReference === undefined) {
        return PublicCheckoutDeliveryOutcomeUnknown.make({
          cartId: error.cartId,
          message: publicMessage,
        });
      }
      if (error.cartId === undefined) {
        return PublicCheckoutDeliveryOutcomeUnknown.make({
          addressBookReference: error.addressBookReference,
          message: publicMessage,
        });
      }
      return PublicCheckoutDeliveryOutcomeUnknown.make({
        addressBookReference: error.addressBookReference,
        cartId: error.cartId,
        message: publicMessage,
      });
    }
    case "CheckoutMutationProviderFailure": {
      const publicMessage = message(
        locale,
        "checkout.deliveryDetails.providerFailure"
      );
      if (error.addressBookReference === undefined) {
        return PublicCheckoutDeliveryProviderFailure.make({
          message: publicMessage,
        });
      }
      return PublicCheckoutDeliveryProviderFailure.make({
        addressBookReference: error.addressBookReference,
        message: publicMessage,
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

export const SaveCheckoutPaymentOptionsOperationPublicErrors = [
  paymentOptionsInputFailure.schema,
  PublicCheckoutPaymentOptionsUnavailable.schema,
  PublicCheckoutPaymentMethodUnavailable.schema,
  PublicCheckoutPaymentPreparationRefreshRequired.schema,
  PublicCheckoutCartMismatch.schema,
  PublicCheckoutContactVersionConflict.schema,
  PublicCheckoutPaymentOutcomeUnknown.schema,
  PublicCheckoutPaymentProviderFailure.schema,
  PublicCheckoutUnavailable.schema,
] as const;
export const SaveCheckoutPaymentOptionsOperationPublicError = Schema.Union(
  SaveCheckoutPaymentOptionsOperationPublicErrors
);
export type SaveCheckoutPaymentOptionsOperationPublicError =
  typeof SaveCheckoutPaymentOptionsOperationPublicError.Type;
export const SaveCheckoutPaymentOptionsPublicError = Schema.Union([
  ...SaveCheckoutPaymentOptionsOperationPublicErrors,
  ...CheckoutRequestPublicErrors,
]);
export type SaveCheckoutPaymentOptionsPublicError =
  typeof SaveCheckoutPaymentOptionsPublicError.Type;

export function projectSaveCheckoutPaymentOptionsFailure(
  error: CheckoutSavePaymentOptionsExpectedFailure,
  locale: string
): SaveCheckoutPaymentOptionsOperationPublicError;
export function projectSaveCheckoutPaymentOptionsFailure(
  error: CheckoutSavePaymentOptionsExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutPaymentOptionsPublicError;
export function projectSaveCheckoutPaymentOptionsFailure(
  error: CheckoutSavePaymentOptionsExpectedFailure | NextCommerceRequestError,
  locale: string
): SaveCheckoutPaymentOptionsPublicError {
  switch (error._tag) {
    case "CheckoutMutationSchemaFailure": {
      const publicMessage = message(
        locale,
        "checkout.paymentOptions.invalidInput"
      );
      return paymentOptionsInputFailure.make({
        issues: publicIssues(error.issues, publicMessage),
        message: publicMessage,
      });
    }
    case "CheckoutPaymentOptionsUnavailable": {
      return PublicCheckoutPaymentOptionsUnavailable.make({
        message: message(locale, "checkout.paymentOptions.unavailable"),
        reason: error.reason,
      });
    }
    case "CheckoutPaymentMethodUnavailable": {
      return PublicCheckoutPaymentMethodUnavailable.make({
        message: message(locale, "checkout.paymentOptions.methodUnavailable"),
        method: error.method,
        reason: error.reason,
      });
    }
    case "CheckoutPaymentPreparationRefreshRequired": {
      return PublicCheckoutPaymentPreparationRefreshRequired.make({
        message: message(
          locale,
          "checkout.paymentOptions.preparationRefreshRequired"
        ),
        preparationReference: error.preparationReference,
        reason: error.reason,
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
        message: message(locale, "checkout.paymentOptions.outcomeUnknown"),
      };
      return error.cartId === undefined
        ? PublicCheckoutPaymentOutcomeUnknown.make(failure)
        : PublicCheckoutPaymentOutcomeUnknown.make({
            ...failure,
            cartId: error.cartId,
          });
    }
    case "CheckoutMutationProviderFailure": {
      return PublicCheckoutPaymentProviderFailure.make({
        message: message(locale, "checkout.paymentOptions.providerFailure"),
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

export const PlaceCheckoutOrderOperationPublicErrors = [
  PublicCheckoutOrderPlacementUnavailable.schema,
  PublicCheckoutPaymentRejected.schema,
  PublicCheckoutPaymentPreparationRefreshRequired.schema,
  PublicCheckoutOrderRejected.schema,
  PublicCheckoutCartMismatch.schema,
  PublicCheckoutOrderProviderFailure.schema,
  PublicCheckoutUnavailable.schema,
] as const;
export const PlaceCheckoutOrderOperationPublicError = Schema.Union(
  PlaceCheckoutOrderOperationPublicErrors
);
export type PlaceCheckoutOrderOperationPublicError =
  typeof PlaceCheckoutOrderOperationPublicError.Type;
export const PlaceCheckoutOrderPublicError = Schema.Union([
  ...PlaceCheckoutOrderOperationPublicErrors,
  ...CheckoutRequestPublicErrors,
]);
export type PlaceCheckoutOrderPublicError =
  typeof PlaceCheckoutOrderPublicError.Type;

export function projectPlaceCheckoutOrderFailure(
  error: CheckoutPlaceOrderFailure,
  locale: string
): PlaceCheckoutOrderOperationPublicError;
export function projectPlaceCheckoutOrderFailure(
  error: CheckoutPlaceOrderFailure | NextCommerceRequestError,
  locale: string
): PlaceCheckoutOrderPublicError;
export function projectPlaceCheckoutOrderFailure(
  error: CheckoutPlaceOrderFailure | NextCommerceRequestError,
  locale: string
): PlaceCheckoutOrderPublicError {
  switch (error._tag) {
    case "CheckoutOrderPlacementUnavailable": {
      return PublicCheckoutOrderPlacementUnavailable.make({
        message: message(locale, "checkout.versionConflict"),
        reason: error.reason,
      });
    }
    case "CheckoutPaymentRejected": {
      return PublicCheckoutPaymentRejected.make({
        message: error.message,
        operation: error.operation,
      });
    }
    case "CheckoutPaymentPreparationRefreshRequired": {
      return PublicCheckoutPaymentPreparationRefreshRequired.make({
        message: message(
          locale,
          "checkout.paymentOptions.preparationRefreshRequired"
        ),
        preparationReference: error.preparationReference,
        reason: error.reason,
      });
    }
    case "OrderPlacementRejected": {
      return PublicCheckoutOrderRejected.make({
        message: error.message,
        reason: error.reason,
      });
    }
    case "CheckoutCartMismatch": {
      return PublicCheckoutCartMismatch.make({
        currentCartId: error.currentCartId,
        message: message(locale, "checkout.cartMismatch"),
        submittedCartId: error.submittedCartId,
      });
    }
    case "CheckoutProviderFailure": {
      return PublicCheckoutOrderProviderFailure.make({
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
