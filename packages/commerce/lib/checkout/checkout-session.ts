import { Context, Effect, Layer, Redacted } from "effect";
import type { CartForCheckout } from "../../domain/cart";
import {
  type BuyerContact,
  type CartOnlyCheckoutDeliveryDetailsInput,
  type CheckoutBuyerContext,
  type CheckoutCartReference,
  type CheckoutContact,
  type CheckoutContactInput,
  type CheckoutContactSource,
  type CheckoutDeliveryDetails,
  type CheckoutDetails,
  type CheckoutMutationFailure,
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  type CheckoutProviderFailure,
  type CheckoutScope,
  type CheckoutState,
  CheckoutUnavailable,
  CheckoutVersionConflict,
} from "../../domain/checkout";
import type { CommerceCustomerProfile } from "../../domain/commerce-account";
import {
  CommerceAccounts,
  type CommerceCustomerProfileNotFound,
} from "../../services/commerce-accounts";
import type { PolicyViolation } from "../cart/policy/cart-policy.types";
import { CheckoutPolicies, type CheckoutPolicy } from "./checkout-policy";
import { checkoutDeliveryDetailsEqual } from "./delivery-details-equality";
import { buildCheckoutState } from "./state";

export interface SaveCheckoutContactInput {
  readonly scope: CheckoutScope;
  readonly cart: CheckoutCartReference;
  readonly contact: CheckoutContactInput;
}

export interface SaveCheckoutDeliveryDetailsInput {
  readonly scope: CheckoutScope;
  readonly cart: CheckoutCartReference;
  readonly deliveryDetails: CartOnlyCheckoutDeliveryDetailsInput;
}

export interface CheckoutSessionMemoryInput {
  readonly currentCart?: CartForCheckout;
  readonly details?: CheckoutDetails;
  readonly buyerContext?: CheckoutBuyerContext;
  readonly allowedContactSources?: readonly CheckoutContactSource[];
  readonly cartPolicyViolations?: readonly PolicyViolation[];
  readonly checkoutPolicies?: readonly CheckoutPolicy[];
  readonly customerProfiles?: readonly CommerceCustomerProfile[];
  readonly saveContactFailure?: CheckoutSaveContactFailure;
  readonly saveDeliveryDetailsFailure?: CheckoutSaveDeliveryDetailsFailure;
}

export type CheckoutSaveContactFailure =
  | CheckoutMutationFailure
  | CheckoutUnavailable;

export type CheckoutSaveDeliveryDetailsFailure =
  | CheckoutMutationFailure
  | CheckoutUnavailable;

const guestBuyerContext: CheckoutBuyerContext = {
  buyerMode: "guest",
  requiresBuyingContext: false,
};

export const defaultAllowedContactSources = [
  "manual",
  "customerProfile",
] as const satisfies readonly CheckoutContactSource[];

export const contactSourceUnavailable = (source: CheckoutContactSource) =>
  new CheckoutMutationSourceUnavailable({
    message:
      source === "manual"
        ? "Manual Contact Source is unavailable for this checkout"
        : "Customer Profile Contact Source is unavailable for this checkout",
    source,
  });

const requiredFieldError = (field: keyof CheckoutContact["buyerContact"]) =>
  new CheckoutMutationSchemaFailure({
    message: `Manual Contact ${field} is required`,
  });

export const normalizeManualContact = (
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

  return Effect.succeed({
    source: "manual",
    buyerContact: {
      email,
      firstName,
      lastName,
      ...(phoneNumber === undefined || phoneNumber.length === 0
        ? {}
        : { phoneNumber }),
    },
  });
};

const customerProfileRequiredFieldError = (field: keyof BuyerContact) =>
  new CheckoutMutationSchemaFailure({
    message: `Customer Profile Contact ${field} is required`,
  });

type CommerceAccountsService = Context.Service.Shape<typeof CommerceAccounts>;

const customerProfileNotFoundToMutationFailure = (
  _error: CommerceCustomerProfileNotFound
) => contactSourceUnavailable("customerProfile");

const resolveCustomerProfileContact = Effect.fn(
  "CheckoutSession.resolveCustomerProfileContact"
)(function* (
  scope: CheckoutScope,
  commerceAccounts: CommerceAccountsService
): Effect.fn.Return<
  CheckoutContact,
  | CheckoutMutationSchemaFailure
  | CheckoutMutationSourceUnavailable
  | CheckoutMutationProviderFailure
> {
  if (scope.channel !== "storefrontCustomer") {
    return yield* contactSourceUnavailable("customerProfile");
  }

  const profile = yield* commerceAccounts
    .getCustomerProfile(scope.customerId)
    .pipe(
      Effect.mapError((error) =>
        error._tag === "CommerceCustomerProfileNotFound"
          ? customerProfileNotFoundToMutationFailure(error)
          : new CheckoutMutationProviderFailure({
              message: error.message,
              operation: "checkout.contact.customerProfile.resolve",
              cause: error,
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

  if (email.length === 0) {
    return yield* customerProfileRequiredFieldError("email");
  }

  if (firstName.length === 0) {
    return yield* customerProfileRequiredFieldError("firstName");
  }

  if (lastName.length === 0) {
    return yield* customerProfileRequiredFieldError("lastName");
  }

  return {
    source: "customerProfile",
    buyerContact: {
      email,
      firstName,
      lastName,
    },
  };
});

export const resolveCheckoutContact = (
  scope: CheckoutScope,
  contact: CheckoutContactInput,
  commerceAccounts: CommerceAccountsService
) =>
  contact.source === "manual"
    ? normalizeManualContact(contact)
    : resolveCustomerProfileContact(scope, commerceAccounts);

export const contactsEqual = (
  left: CheckoutContact | undefined,
  right: CheckoutContact
) =>
  left?.source === right.source &&
  left.buyerContact.email === right.buyerContact.email &&
  left.buyerContact.firstName === right.buyerContact.firstName &&
  left.buyerContact.lastName === right.buyerContact.lastName &&
  left.buyerContact.phoneNumber === right.buyerContact.phoneNumber;

const requiredShippingAddressFieldError = (
  field: keyof CheckoutDeliveryDetails["shippingAddress"]
) =>
  new CheckoutMutationSchemaFailure({
    message: `Manual Shipping Address ${field} is required`,
  });

export const normalizeNewAddressDeliveryDetails = (
  deliveryDetails: CartOnlyCheckoutDeliveryDetailsInput
): Effect.Effect<CheckoutDeliveryDetails, CheckoutMutationSchemaFailure> => {
  const addressLine1 = deliveryDetails.shippingAddress.addressLine1.trim();
  const postalCode = deliveryDetails.shippingAddress.postalCode.trim();
  const city = deliveryDetails.shippingAddress.city.trim();
  const country = deliveryDetails.shippingAddress.country;
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

  return Effect.succeed({
    source: "manual",
    shippingAddress: {
      addressLine1,
      postalCode,
      city,
      country,
      ...(addressLine2 === undefined || addressLine2.length === 0
        ? {}
        : { addressLine2 }),
      ...(region === undefined || region.length === 0 ? {} : { region }),
    },
  });
};

export const ensureCurrentCartReference = (
  currentCart: CartForCheckout,
  submittedCart: CheckoutCartReference,
  detailName: "Contact" | "Delivery Details" = "Contact"
) => {
  if (
    currentCart.id !== submittedCart.id ||
    currentCart.version !== submittedCart.version
  ) {
    return Effect.fail(
      new CheckoutVersionConflict({
        message: `Checkout Cart changed before ${detailName} could be saved`,
        cartId: currentCart.id,
      })
    );
  }

  return Effect.succeed(currentCart);
};

export class CheckoutSession extends Context.Service<
  CheckoutSession,
  {
    readonly getCurrent: (
      scope: CheckoutScope
    ) => Effect.Effect<
      CheckoutState,
      CheckoutUnavailable | CheckoutProviderFailure
    >;
    readonly saveContact: (
      input: SaveCheckoutContactInput
    ) => Effect.Effect<void, CheckoutSaveContactFailure>;
    readonly saveDeliveryDetails: (
      input: SaveCheckoutDeliveryDetailsInput
    ) => Effect.Effect<void, CheckoutSaveDeliveryDetailsFailure>;
  }
>()("@repo/commerce/checkout/CheckoutSession") {
  static readonly getCurrent = Effect.fn("CheckoutSession.getCurrent")(
    (scope: CheckoutScope) =>
      Effect.flatMap(CheckoutSession, (session) => session.getCurrent(scope))
  );

  static readonly saveContact = Effect.fn("CheckoutSession.saveContact")(
    (input: SaveCheckoutContactInput) =>
      Effect.flatMap(CheckoutSession, (session) => session.saveContact(input))
  );

  static readonly saveDeliveryDetails = Effect.fn(
    "CheckoutSession.saveDeliveryDetails"
  )((input: SaveCheckoutDeliveryDetailsInput) =>
    Effect.flatMap(CheckoutSession, (session) =>
      session.saveDeliveryDetails(input)
    )
  );

  static readonly layerMemoryFrom = ({
    currentCart,
    details = {},
    buyerContext = guestBuyerContext,
    allowedContactSources = defaultAllowedContactSources,
    cartPolicyViolations = [],
    checkoutPolicies = [],
    customerProfiles = [],
    saveContactFailure,
    saveDeliveryDetailsFailure,
  }: CheckoutSessionMemoryInput) =>
    Layer.effect(
      CheckoutSession,
      Effect.gen(function* () {
        const policies = yield* CheckoutPolicies;
        const commerceAccounts = yield* CommerceAccounts;
        let activeCart = currentCart;
        let activeDetails = details;

        return CheckoutSession.of({
          getCurrent: (scope) =>
            Effect.gen(function* () {
              if (activeCart === undefined) {
                return yield* Effect.fail(
                  new CheckoutUnavailable({
                    message: "Checkout requires an existing Cart",
                    reason: "noCart",
                  })
                );
              }

              const checkoutPolicyViolations = yield* policies.evaluate({
                cart: activeCart,
                details: activeDetails,
                buyerContext,
              });

              return yield* buildCheckoutState({
                scope,
                cart: activeCart,
                details: activeDetails,
                buyerContext,
                allowedContactSources,
                cartPolicyViolations,
                checkoutPolicyViolations,
              });
            }),
          saveContact: (input) =>
            Effect.gen(function* () {
              if (saveContactFailure !== undefined) {
                return yield* Effect.fail(saveContactFailure);
              }

              if (activeCart === undefined) {
                return yield* Effect.fail(
                  new CheckoutUnavailable({
                    message: "Checkout requires an existing Cart",
                    reason: "noCart",
                  })
                );
              }

              if (!allowedContactSources.includes(input.contact.source)) {
                return yield* Effect.fail(
                  contactSourceUnavailable(input.contact.source)
                );
              }

              const contact = yield* resolveCheckoutContact(
                input.scope,
                input.contact,
                commerceAccounts
              );

              const cart = yield* ensureCurrentCartReference(
                activeCart,
                input.cart
              );

              if (contactsEqual(activeDetails.contact, contact)) {
                return;
              }

              activeDetails = {
                ...activeDetails,
                contact,
              };
              activeCart = {
                ...cart,
                version: cart.version + 1,
              };
            }),
          saveDeliveryDetails: (input) =>
            Effect.gen(function* () {
              if (saveDeliveryDetailsFailure !== undefined) {
                return yield* Effect.fail(saveDeliveryDetailsFailure);
              }

              if (activeCart === undefined) {
                return yield* Effect.fail(
                  new CheckoutUnavailable({
                    message: "Checkout requires an existing Cart",
                    reason: "noCart",
                  })
                );
              }

              const deliveryDetails = yield* normalizeNewAddressDeliveryDetails(
                input.deliveryDetails
              );
              const cart = yield* ensureCurrentCartReference(
                activeCart,
                input.cart,
                "Delivery Details"
              );

              if (
                checkoutDeliveryDetailsEqual(
                  activeDetails.deliveryDetails,
                  deliveryDetails
                )
              ) {
                return;
              }

              activeDetails = {
                ...activeDetails,
                deliveryDetails,
              };
              activeCart = {
                ...cart,
                version: cart.version + 1,
              };
            }),
        });
      })
    ).pipe(
      Layer.provide(CheckoutPolicies.layerFrom(checkoutPolicies)),
      Layer.provide(CommerceAccounts.layerMemoryFrom({ customerProfiles }))
    );
}
