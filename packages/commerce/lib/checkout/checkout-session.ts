import {
  CheckoutPayments,
  PaymentAccountReference,
  PaymentAttemptReference,
  PaymentCheckoutReference,
  PaymentOrderReference,
} from "@repo/payments";
import type {
  PaymentMethodUnavailable,
  PaymentOperationDeclined,
  PaymentOptions,
  PaymentPreparationUnavailable,
  PaymentProviderFailure,
} from "@repo/payments";
import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Random,
  Redacted,
} from "effect";

import type { Address } from "../../domain/address";
import {
  AddressBookReference,
  SaveAddressBookEntryInput,
} from "../../domain/address-book";
import type {
  AddressBookEntry,
  AddressBookProviderFailure,
  AddressBookWriteOutcomeUnknown,
} from "../../domain/address-book";
import type {
  CartSnapshot,
  CurrentCartState,
} from "../../domain/cart-snapshot";
import {
  CheckoutCartMismatch,
  CheckoutCustomerProfileIncomplete,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutMutationIssue,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutPaymentMethodUnavailable,
  CheckoutOrderPlacementUnavailable,
  CheckoutPaymentRejected,
  CheckoutPaymentOptionsUnavailable,
  CheckoutPaymentPreparationRefreshRequired,
  CheckoutProviderFailure,
  CheckoutShippingOptionsRefreshRequired,
  CheckoutShippingSelectionUnavailable,
  CheckoutUnavailable,
  CheckoutVersionConflict,
} from "../../domain/checkout";
import type {
  CheckoutBuyerContext,
  CheckoutCartReference,
  CheckoutContact,
  CheckoutContactInput,
  CheckoutContactMutationFailure,
  CheckoutContactSource,
  CheckoutCustomerProfileField,
  CheckoutDeliveryDetails,
  CheckoutDeliveryDetailsInput,
  CheckoutDeliveryDetailsMutationFailure,
  CheckoutPaymentOptionsMutationFailure,
  CheckoutPaymentSelectionInput,
  CheckoutScope,
  CheckoutShippingOptionsMutationFailure,
} from "../../domain/checkout";
import type { CheckoutState } from "../../domain/checkout-state";
import type { CommerceRequestContextNotFound } from "../../domain/commerce-request-context";
import type {
  DeliveryPlanQuote,
  DeliveryPlanSelection,
  SelectedDeliveryPlan,
} from "../../domain/delivery-plan";
import type {
  OrderRecord,
  OrderPlacementRejected,
  OrderPlacementResult,
  OrderProviderFailure,
} from "../../domain/order";
import { toOrderSnapshot } from "../../domain/order";
import { AddressBook } from "../../services/address-book";
import type {
  AddressBookGetFailure,
  AddressBookSaveFailure,
} from "../../services/address-book";
import type { CommerceCustomerProfileNotFound } from "../../services/commerce-accounts";
import { CommerceContext } from "../../services/commerce-context";
import type {
  CurrentCartReadFailure,
  SaveCurrentCartDetailsFailure,
  SaveCurrentCartShippingOptionsFailure,
} from "../../services/current-cart";
import { CurrentCart } from "../../services/current-cart";
import { DeliveryPlanning } from "../../services/delivery-planning";
import { Orders } from "../../services/orders";
import { CheckoutPolicies } from "./checkout-policy";
import { allowedContactSourcesForCheckout } from "./contact-source-policy";
import {
  selectedDeliveryPlansEqual,
  selectedPlanMatchesQuote,
} from "./delivery-plan-equality";
import {
  retainExpectedCheckoutMutationFailures,
  retainExpectedCheckoutOrderPlacementFailures,
  retainExpectedCheckoutReadFailures,
} from "./failure-policy";
import { toCheckoutScope } from "./request-context";
import { buildCheckoutState } from "./state";

export interface SaveCheckoutContactInput {
  readonly cart: CheckoutCartReference;
  readonly contact: CheckoutContactInput;
}

export interface SaveCheckoutDeliveryDetailsInput {
  readonly cart: CheckoutCartReference;
  readonly deliveryDetails: CheckoutDeliveryDetailsInput;
}

export interface SaveCheckoutDeliveryDetailsResult {
  readonly addressBookReference?: AddressBookReference;
  readonly state: CheckoutState;
}

export interface SaveCheckoutShippingOptionsInput {
  readonly cart: CheckoutCartReference;
  readonly selection: DeliveryPlanSelection;
}

export interface SaveCheckoutPaymentOptionsInput {
  readonly cart: CheckoutCartReference;
  readonly selection: CheckoutPaymentSelectionInput;
}

export interface PlaceCheckoutOrderInput {
  readonly cart: CheckoutCartReference;
}

export interface CheckoutSessionSnapshot {
  readonly deliveryPlanQuote: DeliveryPlanQuote;
  readonly state: CheckoutState;
}

export interface CheckoutPaymentOptionsSnapshot extends CheckoutSessionSnapshot {
  readonly paymentOptions: PaymentOptions;
}

export type CheckoutPreparePaymentOptionsFailure =
  | CheckoutPaymentOptionsUnavailable
  | CheckoutProviderFailure
  | CheckoutUnavailable;

export type CheckoutSaveContactFailure =
  | CheckoutContactMutationFailure
  | CheckoutUnavailable;

export type CheckoutSaveDeliveryDetailsFailure =
  | CheckoutDeliveryDetailsMutationFailure
  | CheckoutUnavailable;

export type CheckoutSaveShippingOptionsFailure =
  | CheckoutShippingOptionsMutationFailure
  | CheckoutUnavailable;

export type CheckoutSavePaymentOptionsFailure =
  | CheckoutPaymentOptionsMutationFailure
  | CheckoutUnavailable;

export type CheckoutPlaceOrderFailure =
  | CheckoutCartMismatch
  | CheckoutOrderPlacementUnavailable
  | CheckoutPaymentPreparationRefreshRequired
  | CheckoutPaymentRejected
  | CheckoutProviderFailure
  | CheckoutUnavailable
  | OrderPlacementRejected;

const guestBuyerContext: CheckoutBuyerContext = {
  buyerMode: "guest",
  requiresBuyingContext: false,
};

const paymentCheckoutFor = (cart: CartSnapshot) => ({
  amount: cart.totalPrice,
  reference: PaymentCheckoutReference.make(cart.id),
});

const requireCheckoutReadyForPayment = (state: CheckoutState) => {
  const incomplete = state.steps.find(
    (step) =>
      step.status === "incomplete" &&
      (step.id === "contact" ||
        step.id === "deliveryDetails" ||
        step.id === "shippingOptions")
  );
  if (incomplete === undefined) {
    return Effect.void;
  }
  if (incomplete.id === "contact") {
    return Effect.fail(
      new CheckoutPaymentOptionsUnavailable({
        message: "Payment Options require the earlier Checkout steps",
        reason: "contactIncomplete",
      })
    );
  }
  if (incomplete.id === "deliveryDetails") {
    return Effect.fail(
      new CheckoutPaymentOptionsUnavailable({
        message: "Payment Options require the earlier Checkout steps",
        reason: "deliveryDetailsIncomplete",
      })
    );
  }
  return Effect.fail(
    new CheckoutPaymentOptionsUnavailable({
      message: "Payment Options require the earlier Checkout steps",
      reason: "shippingOptionsIncomplete",
    })
  );
};

const contactSourceUnavailable = (source: CheckoutContactSource) =>
  new CheckoutMutationSourceUnavailable({
    message:
      source === "manual"
        ? "Manual Contact Source is unavailable for this checkout"
        : "Customer Profile Contact Source is unavailable for this checkout",
    source,
  });

const requiredFieldError = (field: keyof CheckoutContact["buyerContact"]) =>
  new CheckoutMutationSchemaFailure({
    issues: [
      new CheckoutMutationIssue({
        message: `Manual Contact ${field} is required`,
        path: field,
      }),
    ],
    message: `Manual Contact ${field} is required`,
  });

const normalizeManualContact = (
  contact: CheckoutContactInput
): Effect.Effect<
  CheckoutContact,
  CheckoutMutationSchemaFailure | CheckoutMutationSourceUnavailable
> => {
  if (contact.source !== "manual") {
    return Effect.fail(contactSourceUnavailable(contact.source));
  }

  const email = contact.buyerContact.email.trim();
  const firstName = contact.buyerContact.firstName.trim();
  const lastName = contact.buyerContact.lastName.trim();
  const phoneNumber = contact.buyerContact.phoneNumber?.trim();

  if (email.length === 0) {
    return Effect.fail(requiredFieldError("email"));
  }

  if (firstName.length === 0) {
    return Effect.fail(requiredFieldError("firstName"));
  }

  if (lastName.length === 0) {
    return Effect.fail(requiredFieldError("lastName"));
  }

  const buyerContact =
    phoneNumber === undefined || phoneNumber.length === 0
      ? { email, firstName, lastName }
      : { email, firstName, lastName, phoneNumber };

  return Effect.succeed({
    buyerContact,
    source: "manual",
  });
};

type CommerceContextService = CommerceContext["Service"];

const customerProfileNotFoundToMutationFailure = (
  _error: CommerceCustomerProfileNotFound | CommerceRequestContextNotFound
) => contactSourceUnavailable("customerProfile");

const resolveCustomerProfileContact = Effect.fn(
  "CheckoutSession.resolveCustomerProfileContact"
)(function* (
  scope: CheckoutScope,
  commerceContext: CommerceContextService
): Effect.fn.Return<
  CheckoutContact,
  | CheckoutCustomerProfileIncomplete
  | CheckoutMutationSchemaFailure
  | CheckoutMutationSourceUnavailable
  | CheckoutMutationProviderFailure
> {
  if (scope.channel !== "storefrontCustomer") {
    return yield* contactSourceUnavailable("customerProfile");
  }

  const profile = yield* commerceContext.customerProfile().pipe(
    Effect.mapError((error) =>
      error._tag === "CommerceCustomerProfileNotFound" ||
      error._tag === "CommerceRequestContextNotFound"
        ? customerProfileNotFoundToMutationFailure(error)
        : new CheckoutMutationProviderFailure({
            cause: error,
            message: error.message,
            operation: "checkout.contact.customerProfile.resolve",
            reason: "unavailable",
          })
    )
  );
  const email = profile.email ? Redacted.value(profile.email).trim() : "";
  const firstName = profile.firstName
    ? Redacted.value(profile.firstName).trim()
    : "";
  const lastName = profile.lastName
    ? Redacted.value(profile.lastName).trim()
    : "";

  const missingFields: CheckoutCustomerProfileField[] = [];
  if (email.length === 0) {
    missingFields.push("email");
  }
  if (firstName.length === 0) {
    missingFields.push("firstName");
  }
  if (lastName.length === 0) {
    missingFields.push("lastName");
  }

  const [firstMissingField, ...remainingMissingFields] = missingFields;
  if (firstMissingField !== undefined) {
    return yield* new CheckoutCustomerProfileIncomplete({
      message: "Customer Profile is missing required Contact information",
      missingFields: [firstMissingField, ...remainingMissingFields],
    });
  }

  return {
    buyerContact: {
      email,
      firstName,
      lastName,
    },
    source: "customerProfile",
  };
});

const resolveCheckoutContact = (
  scope: CheckoutScope,
  contact: CheckoutContactInput,
  commerceContext: CommerceContextService
) =>
  contact.source === "manual"
    ? normalizeManualContact(contact)
    : resolveCustomerProfileContact(scope, commerceContext);

const requiredShippingAddressFieldError = (
  field: keyof CheckoutDeliveryDetails["shippingAddress"]
) =>
  new CheckoutMutationSchemaFailure({
    issues: [
      new CheckoutMutationIssue({
        message: `Manual Shipping Address ${field} is required`,
        path: field,
      }),
    ],
    message: `Manual Shipping Address ${field} is required`,
  });

const normalizeShippingAddress = (
  deliveryDetails: Extract<CheckoutDeliveryDetailsInput, { type: "manual" }>
) => {
  const addressLine1 = deliveryDetails.shippingAddress.addressLine1.trim();
  const postalCode = deliveryDetails.shippingAddress.postalCode.trim();
  const city = deliveryDetails.shippingAddress.city.trim();
  const { country } = deliveryDetails.shippingAddress;
  const addressLine2 = deliveryDetails.shippingAddress.addressLine2?.trim();
  const region = deliveryDetails.shippingAddress.region?.trim();

  if (addressLine1.length === 0) {
    return Effect.fail(requiredShippingAddressFieldError("addressLine1"));
  }

  if (postalCode.length === 0) {
    return Effect.fail(requiredShippingAddressFieldError("postalCode"));
  }

  if (city.length === 0) {
    return Effect.fail(requiredShippingAddressFieldError("city"));
  }

  let shippingAddress: Address = { addressLine1, city, country, postalCode };
  if (addressLine2 !== undefined && addressLine2.length > 0) {
    shippingAddress = { ...shippingAddress, addressLine2 };
  }
  if (region !== undefined && region.length > 0) {
    shippingAddress = { ...shippingAddress, region };
  }

  return Effect.succeed({ ...deliveryDetails, shippingAddress });
};

const normalizeCheckoutDeliveryDetailsInput = (
  deliveryDetails: CheckoutDeliveryDetailsInput
): Effect.Effect<
  CheckoutDeliveryDetailsInput,
  CheckoutMutationSchemaFailure
> =>
  deliveryDetails.type === "manual"
    ? normalizeShippingAddress(deliveryDetails)
    : Effect.succeed(deliveryDetails);

type AddressBookService = AddressBook["Service"];

interface ResolvedCheckoutDeliveryDetails {
  readonly deliveryDetails: CheckoutDeliveryDetails;
  readonly savedAddressBookReference?: AddressBookReference;
}

const saveDeliveryDetailsResult = (
  resolved: ResolvedCheckoutDeliveryDetails,
  state: CheckoutState
): SaveCheckoutDeliveryDetailsResult =>
  resolved.deliveryDetails.source === "addressBook"
    ? {
        addressBookReference: resolved.deliveryDetails.addressBookReference,
        state,
      }
    : { state };

const addressBookSourceUnavailable = () =>
  new CheckoutMutationSourceUnavailable({
    message: "Address Book is unavailable for this checkout",
    source: "addressBook",
  });

const addressBookEntryUnavailable = (
  addressBookReference: AddressBookReference
) =>
  new CheckoutMutationAddressBookEntryUnavailable({
    addressBookReference,
    message: "Address Book entry is unavailable for Delivery Details",
  });

const addressBookProviderFailure = (error: AddressBookProviderFailure) =>
  new CheckoutMutationProviderFailure({
    cause: error,
    message: error.message,
    operation: `checkout.deliveryDetails.addressBook.${error.operation}`,
    reason: error.reason,
  });

const addressBookWriteOutcomeUnknown = (
  error: AddressBookWriteOutcomeUnknown
) =>
  new CheckoutMutationOutcomeUnknown({
    addressBookReference: error.reference,
    message: error.message,
    operation: "saveDeliveryDetails",
  });

const mapAddressBookSaveError = (error: AddressBookSaveFailure) => {
  switch (error._tag) {
    case "AddressBookAccessDenied":
    case "CommerceRequestContextNotFound": {
      return addressBookSourceUnavailable();
    }
    case "AddressBookProviderFailure": {
      return addressBookProviderFailure(error);
    }
    case "AddressBookWriteOutcomeUnknown": {
      return addressBookWriteOutcomeUnknown(error);
    }
    default: {
      return error satisfies never;
    }
  }
};

const mapAddressBookGetError = (error: AddressBookGetFailure) => {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only failures carrying a saved reference are rebuilt.
  switch (error._tag) {
    case "AddressBookEntryNotFound": {
      return addressBookEntryUnavailable(error.reference);
    }
    case "AddressBookAccessDenied":
    case "CommerceRequestContextNotFound": {
      return addressBookSourceUnavailable();
    }
    case "AddressBookProviderFailure": {
      return addressBookProviderFailure(error);
    }
    default: {
      error satisfies never;
      return addressBookSourceUnavailable();
    }
  }
};

const shippingDeliveryDetailsFromEntry = (
  entry: AddressBookEntry
): Effect.Effect<
  CheckoutDeliveryDetails,
  CheckoutMutationAddressBookEntryUnavailable
> =>
  entry.types.includes("shipping")
    ? Effect.succeed({
        addressBookReference: entry.reference,
        shippingAddress: entry.address,
        source: "addressBook",
      })
    : Effect.fail(addressBookEntryUnavailable(entry.reference));

const resolveCheckoutDeliveryDetails = Effect.fn(
  "CheckoutSession.resolveCheckoutDeliveryDetails"
)(function* (
  input: CheckoutDeliveryDetailsInput,
  addressBook: AddressBookService
): Effect.fn.Return<
  ResolvedCheckoutDeliveryDetails,
  CheckoutDeliveryDetailsMutationFailure
> {
  if (input.type === "manual" && !input.saveToAddressBook) {
    return {
      deliveryDetails: {
        shippingAddress: input.shippingAddress,
        source: "manual",
      },
    };
  }

  if (input.type === "addressBook") {
    const entry = yield* addressBook
      .get(input.addressBookReference)
      .pipe(Effect.mapError(mapAddressBookGetError));

    return {
      deliveryDetails: yield* shippingDeliveryDetailsFromEntry(entry),
    };
  }

  const issuedAt = yield* Clock.currentTimeMillis;
  const entropy = Math.abs(yield* Random.nextInt);
  const reference = AddressBookReference.make(
    `address-book-entry-${issuedAt}-${entropy}`
  );
  const entry = yield* addressBook
    .save(
      new SaveAddressBookEntryInput({
        address: input.shippingAddress,
        defaultBilling: false,
        defaultShipping: input.makeDefaultShipping,
        reference,
        types: ["shipping"],
      })
    )
    .pipe(Effect.mapError(mapAddressBookSaveError));

  return {
    deliveryDetails: yield* shippingDeliveryDetailsFromEntry(entry),
    savedAddressBookReference: entry.reference,
  };
});

const withSavedAddressBookReference = (
  error: CheckoutSaveDeliveryDetailsFailure,
  addressBookReference: AddressBookReference | undefined
): CheckoutSaveDeliveryDetailsFailure => {
  if (addressBookReference === undefined) {
    return error;
  }

  if (error._tag === "CheckoutVersionConflict") {
    return new CheckoutVersionConflict({
      addressBookReference,
      cartId: error.cartId,
      message: error.message,
    });
  }

  if (error._tag === "CheckoutMutationProviderFailure") {
    const failure = {
      addressBookReference,
      message: error.message,
      operation: error.operation,
      reason: error.reason,
    };
    return error.cause === undefined
      ? new CheckoutMutationProviderFailure(failure)
      : new CheckoutMutationProviderFailure({ ...failure, cause: error.cause });
  }

  if (error._tag === "CheckoutMutationOutcomeUnknown") {
    const failure = {
      addressBookReference,
      message: error.message,
      operation: error.operation,
    };
    return error.cartId === undefined
      ? new CheckoutMutationOutcomeUnknown(failure)
      : new CheckoutMutationOutcomeUnknown({
          ...failure,
          cartId: error.cartId,
        });
  }

  return error;
};

const unavailableShippingSelection = (
  selection: DeliveryPlanSelection,
  shippingOptionReference?: DeliveryPlanSelection["groups"][number]["shippingOptionReference"]
) => {
  const failure = {
    message: "The selected Shipping Option is no longer available",
    planReference: selection.reference,
    quoteReference: selection.quoteReference,
  };
  return shippingOptionReference === undefined
    ? new CheckoutShippingSelectionUnavailable(failure)
    : new CheckoutShippingSelectionUnavailable({
        ...failure,
        shippingOptionReference,
      });
};

const resolveSelectedDeliveryPlan = (
  selection: DeliveryPlanSelection,
  quote: DeliveryPlanQuote
): Effect.Effect<
  SelectedDeliveryPlan,
  CheckoutShippingSelectionUnavailable
> => {
  if (selection.quoteReference !== quote.reference) {
    return Effect.fail(unavailableShippingSelection(selection));
  }

  const plan = quote.plans.find(
    (candidate) => candidate.reference === selection.reference
  );
  if (plan === undefined || plan.groups.length !== selection.groups.length) {
    return Effect.fail(unavailableShippingSelection(selection));
  }

  const selectedGroups: SelectedDeliveryPlan["groups"][number][] = [];
  for (const group of plan.groups) {
    const groupSelections = selection.groups.filter(
      (candidate) => candidate.deliveryGroupReference === group.reference
    );
    const [groupSelection] = groupSelections;
    if (groupSelection === undefined || groupSelections.length !== 1) {
      return Effect.fail(unavailableShippingSelection(selection));
    }

    const option = group.shippingOptions.find(
      (candidate) =>
        candidate.reference === groupSelection.shippingOptionReference
    );
    if (option === undefined) {
      return Effect.fail(
        unavailableShippingSelection(
          selection,
          groupSelection.shippingOptionReference
        )
      );
    }

    selectedGroups.push({
      reference: group.reference,
      selectedShippingOption: option,
      shippingAddress: group.shippingAddress,
      targets: group.targets,
    });
  }
  const [firstGroup, ...remainingGroups] = selectedGroups;

  return firstGroup === undefined
    ? Effect.fail(unavailableShippingSelection(selection))
    : Effect.succeed({
        groups: [firstGroup, ...remainingGroups],
        quoteReference: selection.quoteReference,
        reference: selection.reference,
      });
};

const ensureCurrentCartIdentity = (
  currentCart: CartSnapshot,
  submittedCart: CheckoutCartReference,
  detailName:
    | "Contact"
    | "Delivery Details"
    | "Payment Options"
    | "Shipping Options" = "Contact"
) => {
  if (currentCart.id !== submittedCart.id) {
    return Effect.fail(
      new CheckoutCartMismatch({
        currentCartId: currentCart.id,
        message: `${detailName} belongs to a different Checkout Cart`,
        submittedCartId: submittedCart.id,
      })
    );
  }

  return Effect.succeed(currentCart);
};

const deliveryPlanningReadFailure = (error: {
  readonly reason: CheckoutProviderFailure["reason"];
}) =>
  new CheckoutProviderFailure({
    cause: error,
    message: "Failed to quote Delivery Plans",
    operation: "checkout.deliveryPlanning.quote",
    reason: error.reason,
  });

const checkoutReadFailure = (error: CurrentCartReadFailure) =>
  new CheckoutProviderFailure({
    cause: error,
    message: "Failed to resolve Checkout Cart",
    operation: `checkout.currentCart.${error._tag}`,
    reason:
      error._tag === "CartProviderFailure"
        ? error.reason
        : "unexpectedResponse",
  });

const checkoutMutationFailure =
  (
    operation:
      | "saveContact"
      | "saveDeliveryDetails"
      | "savePaymentOptions"
      | "saveShippingOptions"
  ) =>
  (error: SaveCurrentCartDetailsFailure) => {
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- All remaining Cart failures become one Checkout provider failure.
    switch (error._tag) {
      case "CurrentCartUnavailable": {
        return new CheckoutUnavailable({
          message: "Checkout requires an existing Cart",
          reason: error.reason,
        });
      }
      case "CartWriteConflict": {
        return new CheckoutVersionConflict({
          cartId: error.cartId,
          message: "Checkout Cart changed while it was being updated",
        });
      }
      case "CartWriteOutcomeUnknown": {
        const failure = {
          message: "Checkout Cart write outcome could not be confirmed",
          operation,
        };
        return error.cartId === undefined
          ? new CheckoutMutationOutcomeUnknown(failure)
          : new CheckoutMutationOutcomeUnknown({
              ...failure,
              cartId: error.cartId,
            });
      }
      default: {
        return new CheckoutMutationProviderFailure({
          cause: error,
          message: "Failed to update Checkout Cart",
          operation: `checkout.currentCart.${error._tag}`,
          reason:
            error._tag === "CartProviderFailure"
              ? error.reason
              : "unexpectedResponse",
        });
      }
    }
  };

const checkoutShippingMutationFailure =
  (selection: DeliveryPlanSelection) =>
  (error: SaveCurrentCartShippingOptionsFailure) => {
    if (error._tag === "CartShippingSelectionUnavailable") {
      return unavailableShippingSelection(selection);
    }
    if (error._tag === "CartShippingOptionsRefreshRequired") {
      return new CheckoutShippingOptionsRefreshRequired({
        cartId: error.cartId,
        message: "Shipping Options were saved, but Checkout could not refresh",
      });
    }
    return checkoutMutationFailure("saveShippingOptions")(error);
  };

const checkoutMutationReadFailure = (error: CheckoutProviderFailure) =>
  new CheckoutMutationProviderFailure({
    cause: error,
    message: error.message,
    operation: error.operation,
    reason: error.reason,
  });

const checkoutPaymentProviderReason = (error: PaymentProviderFailure) =>
  error.reason === "outcomeUnknown" ? "unavailable" : error.reason;

const paymentPreparationReadFailure = (error: PaymentProviderFailure) =>
  new CheckoutProviderFailure({
    cause: error,
    message: "Failed to prepare Payment Options",
    operation: `checkout.payments.${error.operation}`,
    reason: checkoutPaymentProviderReason(error),
  });

const paymentSaveFailure = (
  error:
    | PaymentMethodUnavailable
    | PaymentPreparationUnavailable
    | PaymentProviderFailure
) => {
  switch (error._tag) {
    case "PaymentMethodUnavailable": {
      return new CheckoutPaymentMethodUnavailable({
        message: "The selected Payment Method is unavailable",
        method: error.method,
        reason: error.reason,
      });
    }
    case "PaymentPreparationUnavailable": {
      return new CheckoutPaymentPreparationRefreshRequired({
        message: "Card details must be refreshed for the current Cart",
        preparationReference: error.preparationReference,
        reason: error.reason,
      });
    }
    case "PaymentProviderFailure": {
      return new CheckoutMutationProviderFailure({
        cause: error,
        message: "Failed to save Payment Options",
        operation: `checkout.payments.${error.operation}`,
        reason: checkoutPaymentProviderReason(error),
      });
    }
    default: {
      return error satisfies never;
    }
  }
};

const paymentPlacementFailure = (
  error:
    | PaymentOperationDeclined
    | PaymentPreparationUnavailable
    | PaymentProviderFailure
) => {
  switch (error._tag) {
    case "PaymentOperationDeclined": {
      return new CheckoutPaymentRejected({
        message: error.message,
        operation: error.operation,
      });
    }
    case "PaymentPreparationUnavailable": {
      return new CheckoutPaymentPreparationRefreshRequired({
        message: "Card details must be refreshed before placing the Order",
        preparationReference: error.preparationReference,
        reason: error.reason,
      });
    }
    case "PaymentProviderFailure": {
      return new CheckoutProviderFailure({
        cause: error,
        message: "Failed to update the Checkout Payment",
        operation: `checkout.payments.${error.operation}`,
        reason: checkoutPaymentProviderReason(error),
      });
    }
    default: {
      return error satisfies never;
    }
  }
};

const orderProviderFailure = (error: OrderProviderFailure) =>
  new CheckoutProviderFailure({
    cause: error,
    message: "Failed to place the Checkout Order",
    operation: `checkout.orders.${error.operation}`,
    reason: error.reason,
  });

const requireCheckoutReadyForOrder = (state: CheckoutState) => {
  if (
    state.steps.some(
      (step) => step.id !== "reviewOrder" && step.status === "incomplete"
    )
  ) {
    return Effect.fail(
      new CheckoutOrderPlacementUnavailable({
        message: "Order placement requires every Checkout step",
        reason: "checkoutIncomplete",
      })
    );
  }
  if (state.details.preparedPayment === undefined) {
    return Effect.fail(
      new CheckoutOrderPlacementUnavailable({
        message: "Order placement requires saved Payment Options",
        reason: "paymentMissing",
      })
    );
  }
  if (state.violations.length > 0) {
    return Effect.fail(
      new CheckoutOrderPlacementUnavailable({
        message: "Checkout policy violations block Order placement",
        reason: "policyViolation",
      })
    );
  }
  return Effect.succeed(state.details.preparedPayment);
};

export class CheckoutSession extends Context.Service<
  CheckoutSession,
  {
    readonly getCurrent: () => Effect.Effect<
      CheckoutState,
      CheckoutUnavailable | CheckoutProviderFailure
    >;
    readonly getCurrentWithDeliveryPlans: () => Effect.Effect<
      CheckoutSessionSnapshot,
      CheckoutUnavailable | CheckoutProviderFailure
    >;
    readonly preparePaymentOptions: () => Effect.Effect<
      CheckoutPaymentOptionsSnapshot,
      CheckoutPreparePaymentOptionsFailure
    >;
    readonly placeOrder: (
      input: PlaceCheckoutOrderInput
    ) => Effect.Effect<OrderPlacementResult, CheckoutPlaceOrderFailure>;
    readonly saveContact: (
      input: SaveCheckoutContactInput
    ) => Effect.Effect<CheckoutState, CheckoutSaveContactFailure>;
    readonly saveDeliveryDetails: (
      input: SaveCheckoutDeliveryDetailsInput
    ) => Effect.Effect<
      SaveCheckoutDeliveryDetailsResult,
      CheckoutSaveDeliveryDetailsFailure
    >;
    readonly saveShippingOptions: (
      input: SaveCheckoutShippingOptionsInput
    ) => Effect.Effect<CheckoutState, CheckoutSaveShippingOptionsFailure>;
    readonly savePaymentOptions: (
      input: SaveCheckoutPaymentOptionsInput
    ) => Effect.Effect<CheckoutState, CheckoutSavePaymentOptionsFailure>;
  }
>()("@repo/commerce/checkout/CheckoutSession") {
  static readonly getCurrent = Effect.fn("CheckoutSession.getCurrent")(() =>
    Effect.gen(function* () {
      const session = yield* CheckoutSession;
      return yield* session.getCurrent();
    }).pipe(retainExpectedCheckoutReadFailures)
  );

  static readonly getCurrentWithDeliveryPlans = Effect.fn(
    "CheckoutSession.getCurrentWithDeliveryPlans"
  )(() =>
    Effect.gen(function* () {
      const session = yield* CheckoutSession;
      return yield* session.getCurrentWithDeliveryPlans();
    }).pipe(retainExpectedCheckoutReadFailures)
  );

  static readonly saveContact = Effect.fn("CheckoutSession.saveContact")(
    (input: SaveCheckoutContactInput) =>
      Effect.gen(function* () {
        const session = yield* CheckoutSession;
        return yield* session.saveContact(input);
      }).pipe(retainExpectedCheckoutMutationFailures)
  );

  static readonly saveDeliveryDetails = Effect.fn(
    "CheckoutSession.saveDeliveryDetails"
  )((input: SaveCheckoutDeliveryDetailsInput) =>
    Effect.gen(function* () {
      const session = yield* CheckoutSession;
      return yield* session.saveDeliveryDetails(input);
    }).pipe(retainExpectedCheckoutMutationFailures)
  );

  static readonly saveShippingOptions = Effect.fn(
    "CheckoutSession.saveShippingOptions"
  )((input: SaveCheckoutShippingOptionsInput) =>
    Effect.gen(function* () {
      const session = yield* CheckoutSession;
      return yield* session.saveShippingOptions(input);
    }).pipe(retainExpectedCheckoutMutationFailures)
  );

  static readonly preparePaymentOptions = Effect.fn(
    "CheckoutSession.preparePaymentOptions"
  )(() =>
    Effect.gen(function* () {
      const session = yield* CheckoutSession;
      return yield* session.preparePaymentOptions();
    }).pipe(retainExpectedCheckoutReadFailures)
  );

  static readonly placeOrder = Effect.fn("CheckoutSession.placeOrder")(
    (input: PlaceCheckoutOrderInput) =>
      Effect.gen(function* () {
        const session = yield* CheckoutSession;
        return yield* session.placeOrder(input);
      }).pipe(retainExpectedCheckoutOrderPlacementFailures)
  );

  static readonly savePaymentOptions = Effect.fn(
    "CheckoutSession.savePaymentOptions"
  )((input: SaveCheckoutPaymentOptionsInput) =>
    Effect.gen(function* () {
      const session = yield* CheckoutSession;
      return yield* session.savePaymentOptions(input);
    }).pipe(retainExpectedCheckoutMutationFailures)
  );

  static readonly layer = Layer.effect(
    CheckoutSession,
    Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const policies = yield* CheckoutPolicies;
      const commerceContext = yield* CommerceContext;
      const addressBook = yield* AddressBook;
      const deliveryPlanning = yield* DeliveryPlanning;
      const checkoutPayments = yield* CheckoutPayments;
      const orders = yield* Orders;
      const scope = toCheckoutScope(commerceContext);

      const paymentBuyer =
        scope.channel === "storefrontAnonymous"
          ? ({ type: "guest" } as const)
          : ({
              accountReference: PaymentAccountReference.make(
                scope.businessUnitId
              ),
              type: "company",
            } as const);

      const buyerContextFor = (cart: CartSnapshot): CheckoutBuyerContext => {
        if (scope.channel === "storefrontAnonymous") {
          return guestBuyerContext;
        }

        const buyerContext = {
          buyerMode: "b2bCustomer",
          requiresBuyingContext: true,
        } as const;
        return cart.buyingContext === undefined
          ? buyerContext
          : { ...buyerContext, buyingContext: cart.buyingContext };
      };

      const buildSnapshot = Effect.fn("CheckoutSession.buildSnapshot")(
        (current: CurrentCartState) =>
          Effect.gen(function* () {
            const buyerContext = buyerContextFor(current.cart);
            const checkoutPolicyViolations = yield* policies.evaluate({
              buyerContext,
              cart: current.cart,
              details: current.cart.checkoutDetails,
            });
            const deliveryPlanQuote = yield* deliveryPlanning
              .quote({ cart: current.cart, locale: scope.locale })
              .pipe(Effect.mapError(deliveryPlanningReadFailure));
            const state = yield* buildCheckoutState({
              allowedContactSources: allowedContactSourcesForCheckout(scope),
              buyerContext,
              cart: current.cart,
              cartPolicyViolations: current.violations,
              checkoutPolicyViolations,
              details: current.cart.checkoutDetails,
              scope,
              shippingOptionsComplete: selectedPlanMatchesQuote(
                current.cart.checkoutDetails.selectedDeliveryPlan,
                deliveryPlanQuote
              ),
            });
            return { deliveryPlanQuote, state };
          })
      );

      const requireCurrent = () =>
        currentCart.get().pipe(
          Effect.mapError(checkoutReadFailure),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                new CheckoutUnavailable({
                  message: "Checkout requires an existing Cart",
                  reason: "noCart",
                }),
              onSome: Effect.succeed,
            })
          ),
          Effect.flatMap((current) =>
            buildSnapshot(current).pipe(
              Effect.map((snapshot) => ({ current, ...snapshot }))
            )
          )
        );

      const finalizeOrder = Effect.fn("CheckoutSession.finalizeOrder")(
        (order: OrderRecord) =>
          Effect.gen(function* () {
            const paymentStatus = yield* checkoutPayments
              .finalize({
                buyer: paymentBuyer,
                checkout: {
                  amount: order.totalPrice,
                  reference: PaymentCheckoutReference.make(order.cartId),
                },
                orderReference: PaymentOrderReference.make(order.id),
                paymentReference: order.paymentReference,
              })
              .pipe(
                Effect.as("confirmed" as const),
                Effect.catch((error) => {
                  const logFailure = Effect.logError(
                    "Order exists but Payment finalization is pending",
                    error
                  ).pipe(
                    Effect.annotateLogs({
                      "checkout.operation": "placeOrder.finalizePayment",
                      "order.id": order.id,
                    })
                  );
                  return error._tag === "PaymentOperationDeclined" ||
                    error.reason === "unavailable" ||
                    error.reason === "outcomeUnknown"
                    ? logFailure.pipe(Effect.as("pending" as const))
                    : logFailure.pipe(Effect.andThen(Effect.die(error)));
                })
              );
            const paymentMethod = yield* checkoutPayments
              .getPaymentMethod(order.paymentReference)
              .pipe(Effect.mapError(paymentPlacementFailure));
            return {
              _tag: "Placed" as const,
              order: toOrderSnapshot(order, paymentMethod),
              paymentStatus,
            };
          })
      );

      return CheckoutSession.of({
        getCurrent: () =>
          requireCurrent().pipe(Effect.map(({ state }) => state)),
        getCurrentWithDeliveryPlans: () =>
          requireCurrent().pipe(
            Effect.map(({ deliveryPlanQuote, state }) => ({
              deliveryPlanQuote,
              state,
            }))
          ),
        placeOrder: (input) =>
          Effect.gen(function* () {
            if (
              scope.channel === "storefrontAnonymous" &&
              scope.anonymousCartId !== input.cart.id
            ) {
              return yield* new CheckoutUnavailable({
                message: "Checkout Cart is inaccessible",
                reason: "inaccessibleCart",
              });
            }
            const existing = yield* orders
              .find({ cartId: input.cart.id, scope })
              .pipe(Effect.mapError(orderProviderFailure));
            if (Option.isSome(existing)) {
              return yield* finalizeOrder(existing.value);
            }

            const { current, state } = yield* requireCurrent();
            yield* ensureCurrentCartIdentity(
              current.cart,
              input.cart,
              "Payment Options"
            );
            const preparedPayment = yield* requireCheckoutReadyForOrder(state);
            const checkout = paymentCheckoutFor(current.cart);
            const paymentInput = {
              buyer: paymentBuyer,
              checkout,
              paymentReference: preparedPayment.paymentReference,
            };
            const clearPaymentOptionsAfterFailure = <E>(
              error: E,
              operation: string
            ) =>
              currentCart.clearPaymentOptions().pipe(
                // oxlint-disable-next-line promise/no-promise-in-callback -- Effect.catch handles a typed Effect failure; this callback does not receive or return a Promise.
                Effect.catch((clearError) =>
                  Effect.logError(
                    "Payment cannot be reused but saved Payment Options could not be cleared",
                    clearError
                  ).pipe(
                    Effect.annotateLogs({
                      "checkout.operation": operation,
                    })
                  )
                ),
                Effect.andThen(Effect.fail(error))
              );
            const authorization = yield* checkoutPayments
              .authorize({
                ...paymentInput,
                payment: preparedPayment,
              })
              .pipe(
                Effect.mapError(paymentPlacementFailure),
                Effect.catchTags({
                  CheckoutPaymentPreparationRefreshRequired: (error) =>
                    clearPaymentOptionsAfterFailure(
                      error,
                      "placeOrder.clearUnusablePaymentOptions"
                    ),
                  CheckoutPaymentRejected: (error) =>
                    clearPaymentOptionsAfterFailure(
                      error,
                      "placeOrder.clearRejectedPaymentOptions"
                    ),
                })
              );
            if (authorization._tag === "ActionRequired") {
              return {
                _tag: "PaymentActionRequired" as const,
                paymentAction: {
                  clientToken: authorization.clientToken,
                  method: "card" as const,
                  provider: authorization.provider,
                  publicConfiguration: authorization.publicConfiguration,
                },
              };
            }

            const order = yield* orders
              .place({
                cartId: current.cart.id,
                paymentReference: preparedPayment.paymentReference,
                scope,
                totalPrice: current.cart.totalPrice,
              })
              .pipe(
                Effect.catchTags({
                  OrderPlacementOutcomeUnknown: () => Effect.succeed(null),
                  OrderPlacementRejected: (error) =>
                    checkoutPayments
                      .cancelAuthorization({
                        ...paymentInput,
                      })
                      .pipe(
                        // oxlint-disable-next-line promise/no-promise-in-callback -- Effect.catch handles a typed Effect failure; this callback does not receive or return a Promise.
                        Effect.catch((cancelError) =>
                          Effect.logError(
                            "Order was rejected and Payment authorization release is pending",
                            cancelError
                          ).pipe(
                            Effect.annotateLogs({
                              "checkout.operation":
                                "placeOrder.cancelAuthorization",
                            })
                          )
                        ),
                        Effect.andThen(Effect.fail(error))
                      ),
                }),
                Effect.mapError((error) =>
                  error._tag === "OrderProviderFailure"
                    ? orderProviderFailure(error)
                    : error
                )
              );
            if (order === null) {
              return { _tag: "PlacementPending" as const };
            }
            return yield* finalizeOrder(order);
          }),
        preparePaymentOptions: () =>
          Effect.gen(function* () {
            const { current, deliveryPlanQuote, state } =
              yield* requireCurrent();
            yield* requireCheckoutReadyForPayment(state);
            const paymentOptions = yield* checkoutPayments
              .prepare({
                buyer: paymentBuyer,
                checkout: paymentCheckoutFor(current.cart),
              })
              .pipe(Effect.mapError(paymentPreparationReadFailure));
            return { deliveryPlanQuote, paymentOptions, state };
          }),
        saveContact: (input) =>
          Effect.gen(function* () {
            const allowedContactSources =
              allowedContactSourcesForCheckout(scope);
            if (!allowedContactSources.includes(input.contact.source)) {
              return yield* contactSourceUnavailable(input.contact.source);
            }
            const contact = yield* resolveCheckoutContact(
              scope,
              input.contact,
              commerceContext
            );
            const { current } = yield* requireCurrent().pipe(
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? checkoutMutationReadFailure(error)
                  : error
              )
            );
            yield* ensureCurrentCartIdentity(current.cart, input.cart);
            const updated = yield* currentCart
              .saveContact(contact)
              .pipe(Effect.mapError(checkoutMutationFailure("saveContact")));
            return yield* buildSnapshot(updated).pipe(
              Effect.map((snapshot) => snapshot.state),
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? checkoutMutationReadFailure(error)
                  : error
              )
            );
          }),
        saveDeliveryDetails: (input) =>
          Effect.gen(function* () {
            const normalizedInput =
              yield* normalizeCheckoutDeliveryDetailsInput(
                input.deliveryDetails
              );
            const { current } = yield* requireCurrent().pipe(
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? checkoutMutationReadFailure(error)
                  : error
              )
            );
            yield* ensureCurrentCartIdentity(
              current.cart,
              input.cart,
              "Delivery Details"
            );
            const resolved = yield* resolveCheckoutDeliveryDetails(
              normalizedInput,
              addressBook
            );
            const updated = yield* currentCart
              .saveDeliveryDetails(resolved.deliveryDetails)
              .pipe(
                Effect.mapError((error) =>
                  withSavedAddressBookReference(
                    checkoutMutationFailure("saveDeliveryDetails")(error),
                    resolved.savedAddressBookReference
                  )
                )
              );
            const state = yield* buildSnapshot(updated).pipe(
              Effect.map((snapshot) => snapshot.state),
              Effect.mapError((error) =>
                withSavedAddressBookReference(
                  error._tag === "CheckoutProviderFailure"
                    ? checkoutMutationReadFailure(error)
                    : error,
                  resolved.savedAddressBookReference
                )
              )
            );
            return saveDeliveryDetailsResult(resolved, state);
          }),
        savePaymentOptions: (input) =>
          Effect.gen(function* () {
            const { current, state } = yield* requireCurrent().pipe(
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? checkoutMutationReadFailure(error)
                  : error
              )
            );
            yield* ensureCurrentCartIdentity(
              current.cart,
              input.cart,
              "Payment Options"
            );
            yield* requireCheckoutReadyForPayment(state);
            const billingAddress =
              current.cart.checkoutDetails.deliveryDetails?.shippingAddress;
            if (billingAddress === undefined) {
              return yield* new CheckoutMutationSchemaFailure({
                issues: [
                  new CheckoutMutationIssue({
                    message: "Payment Options require current Delivery Details",
                    path: "root",
                  }),
                ],
                message: "Payment Options require current Delivery Details",
              });
            }
            const preparedPayment = yield* checkoutPayments
              .save({
                attemptReference: PaymentAttemptReference.make(
                  `checkout-${current.cart.id}-${yield* Clock.currentTimeMillis}-${Math.abs(
                    yield* Random.nextInt
                  )}`
                ),
                billingAddress,
                buyer: paymentBuyer,
                checkout: paymentCheckoutFor(current.cart),
                selection: input.selection.payment,
              })
              .pipe(Effect.mapError(paymentSaveFailure));
            const updated = yield* currentCart
              .savePaymentOptions(preparedPayment)
              .pipe(
                Effect.mapError(checkoutMutationFailure("savePaymentOptions"))
              );
            return yield* buildSnapshot(updated).pipe(
              Effect.map((snapshot) => snapshot.state),
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? checkoutMutationReadFailure(error)
                  : error
              )
            );
          }),
        saveShippingOptions: (input) =>
          Effect.gen(function* () {
            const { current, deliveryPlanQuote } = yield* requireCurrent().pipe(
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? checkoutMutationReadFailure(error)
                  : error
              )
            );
            yield* ensureCurrentCartIdentity(
              current.cart,
              input.cart,
              "Shipping Options"
            );
            const selectedDeliveryPlan = yield* resolveSelectedDeliveryPlan(
              input.selection,
              deliveryPlanQuote
            );
            const updated = yield* currentCart
              .saveShippingOptions(selectedDeliveryPlan)
              .pipe(
                Effect.mapError(
                  checkoutShippingMutationFailure(input.selection)
                )
              );
            if (
              !selectedDeliveryPlansEqual(
                updated.cart.checkoutDetails.selectedDeliveryPlan,
                selectedDeliveryPlan
              )
            ) {
              return yield* unavailableShippingSelection(input.selection);
            }
            return yield* buildSnapshot(updated).pipe(
              Effect.map((snapshot) => snapshot.state),
              Effect.mapError(
                () =>
                  new CheckoutShippingOptionsRefreshRequired({
                    cartId: updated.cart.id,
                    message:
                      "Shipping Options were saved, but Checkout could not refresh",
                  })
              )
            );
          }),
      });
    })
  );
}
