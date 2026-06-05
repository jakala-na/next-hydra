import { Schema } from "effect";
import {
  CartForCheckout,
  CartId,
  LineItemId,
  ProductId,
  Sku,
  StoreKey,
  VariantId,
} from "./cart";
import { CommerceBusinessUnitId, CommerceCustomerId } from "./commerce-account";

export const CheckoutLocale = Schema.NonEmptyString.pipe(
  Schema.brand("CheckoutLocale")
);
export type CheckoutLocale = typeof CheckoutLocale.Type;

export class StorefrontAnonymousCheckoutScope extends Schema.TaggedClass<StorefrontAnonymousCheckoutScope>()(
  "StorefrontAnonymousCheckoutScope",
  {
    channel: Schema.Literal("storefrontAnonymous"),
    locale: CheckoutLocale,
    anonymousCartId: Schema.optional(CartId),
  }
) {}

export class StorefrontCustomerCheckoutScope extends Schema.TaggedClass<StorefrontCustomerCheckoutScope>()(
  "StorefrontCustomerCheckoutScope",
  {
    channel: Schema.Literal("storefrontCustomer"),
    locale: CheckoutLocale,
    customerId: CommerceCustomerId,
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
  source: CheckoutContactSource,
  buyerContact: BuyerContact,
});
export type CheckoutContact = typeof CheckoutContact.Type;

export const BuyingContext = Schema.Struct({
  businessUnitId: CommerceBusinessUnitId,
});
export type BuyingContext = typeof BuyingContext.Type;

export const ShippingAddress = Schema.Struct({
  streetName: Schema.String,
  postalCode: Schema.String,
  city: Schema.String,
  country: Schema.String,
  additionalStreetInfo: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
});
export type ShippingAddress = typeof ShippingAddress.Type;

export const CheckoutDeliveryDetailsSource = Schema.Literals([
  "manual",
  "addressBook",
]);
export type CheckoutDeliveryDetailsSource =
  typeof CheckoutDeliveryDetailsSource.Type;

export const CheckoutDeliveryDetails = Schema.Struct({
  source: CheckoutDeliveryDetailsSource,
  shippingAddress: ShippingAddress,
});
export type CheckoutDeliveryDetails = typeof CheckoutDeliveryDetails.Type;

export const CheckoutDetails = Schema.Struct({
  contact: Schema.optional(CheckoutContact),
  buyingContext: Schema.optional(BuyingContext),
  deliveryDetails: Schema.optional(CheckoutDeliveryDetails),
});
export type CheckoutDetails = typeof CheckoutDetails.Type;

export const ViolationTarget = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("cart"),
  }),
  Schema.Struct({
    type: Schema.Literal("cartItem"),
    lineItemId: Schema.optional(LineItemId),
    productId: ProductId,
    variantId: Schema.optional(VariantId),
    sku: Schema.optional(Sku),
  }),
  Schema.Struct({
    type: Schema.Literal("checkoutStep"),
    step: CheckoutStepId,
  }),
]);
export type ViolationTarget = typeof ViolationTarget.Type;

export const CheckoutViolationSource = Schema.Literals([
  "cartPolicy",
  "checkoutPolicy",
]);
export type CheckoutViolationSource = typeof CheckoutViolationSource.Type;

export const CheckoutViolation = Schema.Struct({
  source: CheckoutViolationSource,
  severity: Schema.Literal("blocking"),
  code: Schema.String,
  message: Schema.String,
  targets: Schema.Array(ViolationTarget),
});
export type CheckoutViolation = typeof CheckoutViolation.Type;

export const CheckoutPolicyViolation = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  targets: Schema.Array(ViolationTarget),
});
export type CheckoutPolicyViolation = typeof CheckoutPolicyViolation.Type;

export const CheckoutState = Schema.Struct({
  scope: CheckoutScope,
  cart: CartForCheckout,
  details: CheckoutDetails,
  steps: Schema.Array(CheckoutStep),
  activeStep: CheckoutStepId,
  violations: Schema.Array(CheckoutViolation),
});
export type CheckoutState = typeof CheckoutState.Type;

export const CheckoutStoreContext = Schema.Struct({
  locale: CheckoutLocale,
  storeKey: StoreKey,
  currency: Schema.String,
});
export type CheckoutStoreContext = typeof CheckoutStoreContext.Type;

export const CheckoutBuyerContext = Schema.Struct({
  buyerMode: Schema.Literals(["guest", "customer", "b2bCustomer"]),
  requiresBuyingContext: Schema.Boolean,
  buyingContext: Schema.optional(BuyingContext),
});
export type CheckoutBuyerContext = typeof CheckoutBuyerContext.Type;

export class CheckoutUnavailable extends Schema.TaggedErrorClass<CheckoutUnavailable>()(
  "CheckoutUnavailable",
  {
    message: Schema.String,
    reason: Schema.Literals(["noCart", "emptyCart", "inaccessibleCart"]),
  }
) {}

export class CheckoutProviderFailure extends Schema.TaggedErrorClass<CheckoutProviderFailure>()(
  "CheckoutProviderFailure",
  {
    message: Schema.String,
    operation: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class CheckoutMutationSchemaFailure extends Schema.TaggedErrorClass<CheckoutMutationSchemaFailure>()(
  "CheckoutMutationSchemaFailure",
  {
    message: Schema.String,
  }
) {}

export class CheckoutMutationSourceUnavailable extends Schema.TaggedErrorClass<CheckoutMutationSourceUnavailable>()(
  "CheckoutMutationSourceUnavailable",
  {
    message: Schema.String,
    source: Schema.String,
  }
) {}

export class CheckoutVersionConflict extends Schema.TaggedErrorClass<CheckoutVersionConflict>()(
  "CheckoutVersionConflict",
  {
    message: Schema.String,
    cartId: CartId,
  }
) {}

export class CheckoutMutationProviderFailure extends Schema.TaggedErrorClass<CheckoutMutationProviderFailure>()(
  "CheckoutMutationProviderFailure",
  {
    message: Schema.String,
    operation: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class CheckoutMutationUnsupported extends Schema.TaggedErrorClass<CheckoutMutationUnsupported>()(
  "CheckoutMutationUnsupported",
  {
    message: Schema.String,
    operation: Schema.Literals(["saveContact", "saveDeliveryDetails"]),
  }
) {}

export const CheckoutMutationFailure = Schema.Union([
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutVersionConflict,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
]);
export type CheckoutMutationFailure = typeof CheckoutMutationFailure.Type;
