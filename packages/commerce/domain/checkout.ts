import {
  PaymentMethod,
  PaymentSelection,
  PreparedPayment,
  PreparedPaymentReference,
} from "@repo/payments";
import { Schema } from "effect";

import { CommerceLocale } from "../store";
import { Address, CountryCodeFromString } from "./address";
import { AddressBookReference } from "./address-book";
import { CartId, LineItemId, ProductId, Sku, VariantId } from "./cart";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "./commerce-account";
import {
  DeliveryPlanSelection,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  SelectedDeliveryPlan,
  ShippingOptionReference,
} from "./delivery-plan";
import { ProviderFailureReason } from "./provider-failure";

export class StorefrontAnonymousCheckoutScope extends Schema.TaggedClass<StorefrontAnonymousCheckoutScope>()(
  "StorefrontAnonymousCheckoutScope",
  {
    anonymousCartId: Schema.optional(CartId),
    channel: Schema.Literal("storefrontAnonymous"),
    locale: CommerceLocale,
  }
) {}

export class StorefrontCustomerCheckoutScope extends Schema.TaggedClass<StorefrontCustomerCheckoutScope>()(
  "StorefrontCustomerCheckoutScope",
  {
    businessUnitId: CommerceBusinessUnitId,
    businessUnitKey: CommerceBusinessUnitKey,
    channel: Schema.Literal("storefrontCustomer"),
    customerId: CommerceCustomerId,
    locale: CommerceLocale,
  }
) {}

export const CheckoutScope = Schema.Union([
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
]);
export type CheckoutScope = typeof CheckoutScope.Type;

export const CheckoutStepId = Schema.Literals([
  "contact",
  "deliveryDetails",
  "shippingOptions",
  "paymentOptions",
  "reviewOrder",
]);
export type CheckoutStepId = typeof CheckoutStepId.Type;

export const CheckoutStepStatus = Schema.Literals(["complete", "incomplete"]);
export type CheckoutStepStatus = typeof CheckoutStepStatus.Type;

export const CheckoutStep = Schema.Struct({
  id: CheckoutStepId,
  status: CheckoutStepStatus,
});
export type CheckoutStep = typeof CheckoutStep.Type;

export const BuyerContact = Schema.Struct({
  email: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  phoneNumber: Schema.optional(Schema.String),
});
export type BuyerContact = typeof BuyerContact.Type;

export const CheckoutContactSource = Schema.Literals([
  "manual",
  "customerProfile",
]);
export type CheckoutContactSource = typeof CheckoutContactSource.Type;

export const CheckoutContact = Schema.Struct({
  buyerContact: BuyerContact,
  source: CheckoutContactSource,
});
export type CheckoutContact = typeof CheckoutContact.Type;

export const ManualCheckoutContactInput = Schema.Struct({
  buyerContact: BuyerContact,
  source: Schema.Literal("manual"),
}).annotate({
  description: "Contact details supplied in this request.",
  identifier: "ManualCheckoutContactInput",
  title: "Manual contact",
});
export type ManualCheckoutContactInput = typeof ManualCheckoutContactInput.Type;

export const CustomerProfileCheckoutContactInput = Schema.Struct({
  source: Schema.Literal("customerProfile"),
}).annotate({
  description:
    "Contact details resolved from the authenticated customer's commerce profile.",
  identifier: "CustomerProfileCheckoutContactInput",
  title: "Customer profile contact",
});
export type CustomerProfileCheckoutContactInput =
  typeof CustomerProfileCheckoutContactInput.Type;

export const CheckoutContactInput = Schema.Union([
  ManualCheckoutContactInput,
  CustomerProfileCheckoutContactInput,
]).annotate({
  identifier: "CheckoutContactInput",
  title: "Checkout contact",
});
export type CheckoutContactInput = typeof CheckoutContactInput.Type;

export const CheckoutCartReference = Schema.Struct({
  id: CartId,
});
export type CheckoutCartReference = typeof CheckoutCartReference.Type;

export const BuyingContext = Schema.Struct({
  businessUnitId: CommerceBusinessUnitId,
});
export type BuyingContext = typeof BuyingContext.Type;

export { CountryCode, CountryCodeFromString } from "./address";

export const ShippingAddress = Address;
export type ShippingAddress = typeof ShippingAddress.Type;

export const CartOnlyCheckoutDeliveryDetailsInput = Schema.Struct({
  saveToAddressBook: Schema.Literal(false),
  shippingAddress: ShippingAddress,
  type: Schema.Literal("manual"),
});
export type CartOnlyCheckoutDeliveryDetailsInput =
  typeof CartOnlyCheckoutDeliveryDetailsInput.Type;

export const SaveManualAddressCheckoutDeliveryDetailsInput = Schema.Struct({
  makeDefaultShipping: Schema.Boolean,
  saveToAddressBook: Schema.Literal(true),
  shippingAddress: ShippingAddress,
  type: Schema.Literal("manual"),
});
export type SaveManualAddressCheckoutDeliveryDetailsInput =
  typeof SaveManualAddressCheckoutDeliveryDetailsInput.Type;

export const ManualCheckoutDeliveryDetailsInput = Schema.Union([
  CartOnlyCheckoutDeliveryDetailsInput,
  SaveManualAddressCheckoutDeliveryDetailsInput,
]);
export type ManualCheckoutDeliveryDetailsInput =
  typeof ManualCheckoutDeliveryDetailsInput.Type;

export const AddressBookCheckoutDeliveryDetailsInput = Schema.Struct({
  addressBookReference: AddressBookReference,
  type: Schema.Literal("addressBook"),
});
export type AddressBookCheckoutDeliveryDetailsInput =
  typeof AddressBookCheckoutDeliveryDetailsInput.Type;

export const CheckoutDeliveryDetailsInput = Schema.Union([
  ManualCheckoutDeliveryDetailsInput,
  AddressBookCheckoutDeliveryDetailsInput,
]);
export type CheckoutDeliveryDetailsInput =
  typeof CheckoutDeliveryDetailsInput.Type;

export const CheckoutDeliveryDetailsSource = Schema.Literals([
  "manual",
  "addressBook",
]);
export type CheckoutDeliveryDetailsSource =
  typeof CheckoutDeliveryDetailsSource.Type;

export const CheckoutDeliveryDetails = Schema.Union([
  Schema.Struct({
    shippingAddress: ShippingAddress,
    source: Schema.Literal("manual"),
  }),
  Schema.Struct({
    addressBookReference: AddressBookReference,
    shippingAddress: ShippingAddress,
    source: Schema.Literal("addressBook"),
  }),
]);
export type CheckoutDeliveryDetails = typeof CheckoutDeliveryDetails.Type;

export const CheckoutDetails = Schema.Struct({
  buyingContext: Schema.optional(BuyingContext),
  contact: Schema.optional(CheckoutContact),
  deliveryDetails: Schema.optional(CheckoutDeliveryDetails),
  preparedPayment: Schema.optional(PreparedPayment),
  selectedDeliveryPlan: Schema.optional(SelectedDeliveryPlan),
});
export type CheckoutDetails = typeof CheckoutDetails.Type;

export const CheckoutBillingAddressInput = Schema.Struct({
  source: Schema.Literal("shippingAddress"),
});
export type CheckoutBillingAddressInput =
  typeof CheckoutBillingAddressInput.Type;

export const CheckoutPaymentSelectionInput = Schema.Struct({
  billingAddress: CheckoutBillingAddressInput,
  payment: PaymentSelection,
});
export type CheckoutPaymentSelectionInput =
  typeof CheckoutPaymentSelectionInput.Type;

const RequiredCheckoutInputString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);

const CheckoutMutationBuyerContactInput = Schema.Struct({
  email: RequiredCheckoutInputString,
  firstName: RequiredCheckoutInputString,
  lastName: RequiredCheckoutInputString,
  phoneNumber: Schema.optional(Schema.String),
});

const CheckoutMutationContactInput = Schema.Union([
  Schema.Struct({
    buyerContact: CheckoutMutationBuyerContactInput,
    source: Schema.Literal("manual"),
  }),
  CustomerProfileCheckoutContactInput,
]);

const CheckoutMutationShippingAddressInput = Schema.Struct({
  addressLine1: RequiredCheckoutInputString,
  addressLine2: Schema.optional(Schema.String),
  city: RequiredCheckoutInputString,
  country: CountryCodeFromString,
  postalCode: RequiredCheckoutInputString,
  region: Schema.optional(Schema.String),
});

const CheckoutMutationDeliveryDetailsInput = Schema.Union([
  Schema.Struct({
    saveToAddressBook: Schema.Literal(false),
    shippingAddress: CheckoutMutationShippingAddressInput,
    type: Schema.Literal("manual"),
  }),
  Schema.Struct({
    makeDefaultShipping: Schema.Boolean,
    saveToAddressBook: Schema.Literal(true),
    shippingAddress: CheckoutMutationShippingAddressInput,
    type: Schema.Literal("manual"),
  }),
  AddressBookCheckoutDeliveryDetailsInput,
]);

export const SaveCheckoutContactInput = Schema.Struct({
  cart: CheckoutCartReference,
  contact: CheckoutMutationContactInput,
}).annotate({ identifier: "SaveCheckoutContactInput" });
export type SaveCheckoutContactInput = typeof SaveCheckoutContactInput.Type;

export const SaveCheckoutDeliveryDetailsInput = Schema.Struct({
  cart: CheckoutCartReference,
  deliveryDetails: CheckoutMutationDeliveryDetailsInput,
}).annotate({ identifier: "SaveCheckoutDeliveryDetailsInput" });
export type SaveCheckoutDeliveryDetailsInput =
  typeof SaveCheckoutDeliveryDetailsInput.Type;

export const SaveCheckoutShippingOptionsInput = Schema.Struct({
  cart: CheckoutCartReference,
  selection: DeliveryPlanSelection,
}).annotate({ identifier: "SaveCheckoutShippingOptionsInput" });
export type SaveCheckoutShippingOptionsInput =
  typeof SaveCheckoutShippingOptionsInput.Type;

export const SaveCheckoutPaymentOptionsInput = Schema.Struct({
  cart: CheckoutCartReference,
  selection: CheckoutPaymentSelectionInput,
}).annotate({ identifier: "SaveCheckoutPaymentOptionsInput" });
export type SaveCheckoutPaymentOptionsInput =
  typeof SaveCheckoutPaymentOptionsInput.Type;

export const PlaceCheckoutOrderInput = Schema.Struct({
  cart: CheckoutCartReference,
}).annotate({ identifier: "PlaceCheckoutOrderInput" });
export type PlaceCheckoutOrderInput = typeof PlaceCheckoutOrderInput.Type;

export const ViolationTarget = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("cart"),
  }),
  Schema.Struct({
    lineItemId: Schema.optional(LineItemId),
    productId: ProductId,
    sku: Schema.optional(Sku),
    type: Schema.Literal("cartItem"),
    variantId: Schema.optional(VariantId),
  }),
  Schema.Struct({
    step: CheckoutStepId,
    type: Schema.Literal("checkoutStep"),
  }),
]);
export type ViolationTarget = typeof ViolationTarget.Type;

export const CheckoutViolationSource = Schema.Literals([
  "cartPolicy",
  "checkoutPolicy",
]);
export type CheckoutViolationSource = typeof CheckoutViolationSource.Type;

export const CheckoutViolationParameter = Schema.Union([
  Schema.String,
  Schema.Finite,
]);
export type CheckoutViolationParameter = typeof CheckoutViolationParameter.Type;

export const CheckoutViolationParameters = Schema.Record(
  Schema.String,
  CheckoutViolationParameter
);
export type CheckoutViolationParameters =
  typeof CheckoutViolationParameters.Type;

export const CheckoutViolation = Schema.Struct({
  code: Schema.String,
  parameters: Schema.optional(CheckoutViolationParameters),
  severity: Schema.Literal("blocking"),
  source: CheckoutViolationSource,
  targets: Schema.Array(ViolationTarget),
});
export type CheckoutViolation = typeof CheckoutViolation.Type;

export const CheckoutPolicyViolation = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  parameters: Schema.optional(CheckoutViolationParameters),
  targets: Schema.Array(ViolationTarget),
});
export type CheckoutPolicyViolation = typeof CheckoutPolicyViolation.Type;

export const CheckoutBuyerContext = Schema.Struct({
  buyerMode: Schema.Literals(["guest", "customer", "b2bCustomer"]),
  buyingContext: Schema.optional(BuyingContext),
  requiresBuyingContext: Schema.Boolean,
});
export type CheckoutBuyerContext = typeof CheckoutBuyerContext.Type;

export class CheckoutUnavailable extends Schema.TaggedError<CheckoutUnavailable>()(
  "CheckoutUnavailable",
  {
    message: Schema.String,
    reason: Schema.Literals(["noCart", "emptyCart", "inaccessibleCart"]),
  }
) {}

export class CheckoutProviderFailure extends Schema.TaggedError<CheckoutProviderFailure>()(
  "CheckoutProviderFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
    reason: ProviderFailureReason,
  }
) {}

export class CheckoutMutationSourceUnavailable extends Schema.TaggedError<CheckoutMutationSourceUnavailable>()(
  "CheckoutMutationSourceUnavailable",
  {
    message: Schema.String,
    source: Schema.String,
  }
) {}

export const CheckoutCustomerProfileField = Schema.Literals([
  "email",
  "firstName",
  "lastName",
]);
export type CheckoutCustomerProfileField =
  typeof CheckoutCustomerProfileField.Type;

export class CheckoutCustomerProfileIncomplete extends Schema.TaggedError<CheckoutCustomerProfileIncomplete>()(
  "CheckoutCustomerProfileIncomplete",
  {
    message: Schema.String,
    missingFields: Schema.NonEmptyArray(CheckoutCustomerProfileField).check(
      Schema.isUnique()
    ),
  }
) {}

export class CheckoutMutationAddressBookEntryUnavailable extends Schema.TaggedError<CheckoutMutationAddressBookEntryUnavailable>()(
  "CheckoutMutationAddressBookEntryUnavailable",
  {
    addressBookReference: AddressBookReference,
    message: Schema.String,
  }
) {}

export class CheckoutShippingSelectionUnavailable extends Schema.TaggedError<CheckoutShippingSelectionUnavailable>()(
  "CheckoutShippingSelectionUnavailable",
  {
    message: Schema.String,
    planReference: DeliveryPlanReference,
    quoteReference: DeliveryPlanQuoteReference,
    shippingOptionReference: Schema.optional(ShippingOptionReference),
  }
) {}

export class CheckoutShippingOptionsRefreshRequired extends Schema.TaggedError<CheckoutShippingOptionsRefreshRequired>()(
  "CheckoutShippingOptionsRefreshRequired",
  {
    cartId: CartId,
    message: Schema.String,
  }
) {}

export class CheckoutCartMismatch extends Schema.TaggedError<CheckoutCartMismatch>()(
  "CheckoutCartMismatch",
  {
    currentCartId: CartId,
    message: Schema.String,
    submittedCartId: CartId,
  }
) {}

export class CheckoutVersionConflict extends Schema.TaggedError<CheckoutVersionConflict>()(
  "CheckoutVersionConflict",
  {
    addressBookReference: Schema.optional(AddressBookReference),
    cartId: CartId,
    message: Schema.String,
  }
) {}

export class CheckoutMutationOutcomeUnknown extends Schema.TaggedError<CheckoutMutationOutcomeUnknown>()(
  "CheckoutMutationOutcomeUnknown",
  {
    addressBookReference: Schema.optional(AddressBookReference),
    cartId: Schema.optional(CartId),
    message: Schema.String,
    operation: Schema.Literals([
      "saveContact",
      "saveDeliveryDetails",
      "savePaymentOptions",
      "saveShippingOptions",
    ]),
  }
) {}

export class CheckoutMutationProviderFailure extends Schema.TaggedError<CheckoutMutationProviderFailure>()(
  "CheckoutMutationProviderFailure",
  {
    addressBookReference: Schema.optional(AddressBookReference),
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
    reason: ProviderFailureReason,
  }
) {}

export class CheckoutMutationUnsupported extends Schema.TaggedError<CheckoutMutationUnsupported>()(
  "CheckoutMutationUnsupported",
  {
    message: Schema.String,
    operation: Schema.Literals([
      "saveContact",
      "saveDeliveryDetails",
      "savePaymentOptions",
      "saveShippingOptions",
    ]),
  }
) {}

export class CheckoutPaymentMethodUnavailable extends Schema.TaggedError<CheckoutPaymentMethodUnavailable>()(
  "CheckoutPaymentMethodUnavailable",
  {
    message: Schema.String,
    method: PaymentMethod,
    reason: Schema.Literals(["insufficientAvailableCredit", "notEligible"]),
  }
) {}

export class CheckoutPaymentOptionsUnavailable extends Schema.TaggedError<CheckoutPaymentOptionsUnavailable>()(
  "CheckoutPaymentOptionsUnavailable",
  {
    message: Schema.String,
    reason: Schema.Literals([
      "contactIncomplete",
      "deliveryDetailsIncomplete",
      "shippingOptionsIncomplete",
    ]),
  }
) {}

export class CheckoutPaymentPreparationRefreshRequired extends Schema.TaggedError<CheckoutPaymentPreparationRefreshRequired>()(
  "CheckoutPaymentPreparationRefreshRequired",
  {
    message: Schema.String,
    preparationReference: PreparedPaymentReference,
    reason: Schema.Literals([
      "amountChanged",
      "authorizationReleased",
      "notFound",
      "confirmationUnavailable",
    ]),
  }
) {}

export class CheckoutOrderPlacementUnavailable extends Schema.TaggedError<CheckoutOrderPlacementUnavailable>()(
  "CheckoutOrderPlacementUnavailable",
  {
    message: Schema.String,
    reason: Schema.Literals([
      "checkoutIncomplete",
      "paymentChanged",
      "paymentMissing",
      "policyViolation",
    ]),
  }
) {}

export class CheckoutPaymentRejected extends Schema.TaggedError<CheckoutPaymentRejected>()(
  "CheckoutPaymentRejected",
  {
    message: Schema.String,
    operation: Schema.Literals(["authorize", "capture"]),
  }
) {}

export const CheckoutMutationFailure = Schema.Union([
  CheckoutMutationSourceUnavailable,
  CheckoutCustomerProfileIncomplete,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutShippingSelectionUnavailable,
  CheckoutShippingOptionsRefreshRequired,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
  CheckoutPaymentOptionsUnavailable,
  CheckoutPaymentMethodUnavailable,
  CheckoutPaymentPreparationRefreshRequired,
]);
export type CheckoutMutationFailure = typeof CheckoutMutationFailure.Type;

export const CheckoutContactMutationFailure = Schema.Union([
  CheckoutMutationSourceUnavailable,
  CheckoutCustomerProfileIncomplete,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
]);
export type CheckoutContactMutationFailure =
  typeof CheckoutContactMutationFailure.Type;

export const CheckoutDeliveryDetailsMutationFailure = Schema.Union([
  CheckoutMutationSourceUnavailable,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
]);
export type CheckoutDeliveryDetailsMutationFailure =
  typeof CheckoutDeliveryDetailsMutationFailure.Type;

export const CheckoutShippingOptionsMutationFailure = Schema.Union([
  CheckoutShippingSelectionUnavailable,
  CheckoutShippingOptionsRefreshRequired,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
]);
export type CheckoutShippingOptionsMutationFailure =
  typeof CheckoutShippingOptionsMutationFailure.Type;

export const CheckoutPaymentOptionsMutationFailure = Schema.Union([
  CheckoutPaymentOptionsUnavailable,
  CheckoutPaymentMethodUnavailable,
  CheckoutPaymentPreparationRefreshRequired,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
]);
export type CheckoutPaymentOptionsMutationFailure =
  typeof CheckoutPaymentOptionsMutationFailure.Type;
