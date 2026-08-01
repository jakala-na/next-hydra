import { Context, Effect, Layer, Option, Random, Redacted } from "effect";
import {
  type AddressBookEntry,
  type AddressBookGetError,
  type AddressBookProviderFailure,
  AddressBookReference,
  SaveAddressBookEntryInput,
} from "../../domain/address-book";
import type {
  CartSnapshot,
  CurrentCartState,
} from "../../domain/cart-snapshot";
import {
  type BuyerContact,
  type CheckoutBuyerContext,
  CheckoutCartMismatch,
  type CheckoutCartReference,
  type CheckoutContact,
  type CheckoutContactInput,
  type CheckoutContactMutationFailure,
  type CheckoutContactSource,
  type CheckoutDeliveryDetails,
  type CheckoutDeliveryDetailsInput,
  CheckoutMutationAddressBookEntryUnavailable,
  type CheckoutMutationFailure,
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutProviderFailure,
  type CheckoutScope,
  type CheckoutState,
  CheckoutUnavailable,
  CheckoutVersionConflict,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import {
  type CommerceRequestContext,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";
import { AddressBook } from "../../services/address-book";
import {
  CommerceAccounts,
  type CommerceCustomerProfileNotFound,
} from "../../services/commerce-accounts";
import type {
  CurrentCartReadFailure,
  SaveCurrentCartDetailsFailure,
} from "../../services/current-cart";
import { CurrentCart } from "../../services/current-cart";
import { CheckoutPolicies } from "./checkout-policy";
import { allowedContactSourcesForCheckout } from "./contact-source-policy";
import { buildCheckoutState } from "./state";

export interface SaveCheckoutContactInput {
  readonly scope: CheckoutScope;
  readonly cart: CheckoutCartReference;
  readonly contact: CheckoutContactInput;
}

export interface SaveCheckoutDeliveryDetailsInput {
  readonly context: CommerceRequestContext;
  readonly cart: CheckoutCartReference;
  readonly deliveryDetails: CheckoutDeliveryDetailsInput;
}

export interface SaveCheckoutDeliveryDetailsResult {
  readonly addressBookReference?: AddressBookReference;
  readonly state: CheckoutState;
}

export type CheckoutSaveContactFailure =
  | CheckoutContactMutationFailure
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

const normalizeShippingAddress = (
  deliveryDetails: Extract<CheckoutDeliveryDetailsInput, { type: "manual" }>
) => {
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
    ...deliveryDetails,
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

export const normalizeCheckoutDeliveryDetailsInput = (
  deliveryDetails: CheckoutDeliveryDetailsInput
): Effect.Effect<
  CheckoutDeliveryDetailsInput,
  CheckoutMutationSchemaFailure
> =>
  deliveryDetails.type === "manual"
    ? normalizeShippingAddress(deliveryDetails)
    : Effect.succeed(deliveryDetails);

type AddressBookService = Context.Service.Shape<typeof AddressBook>;

export interface ResolvedCheckoutDeliveryDetails {
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
    message: "Address Book entry is unavailable for Delivery Details",
    addressBookReference,
  });

const addressBookProviderFailure = (error: AddressBookProviderFailure) =>
  new CheckoutMutationProviderFailure({
    message: error.message,
    operation: `checkout.deliveryDetails.addressBook.${error.operation}`,
    cause: error,
  });

const mapAddressBookGetError = (error: AddressBookGetError) => {
  switch (error._tag) {
    case "AddressBookEntryNotFound":
      return addressBookEntryUnavailable(error.reference);
    case "AddressBookAccessDenied":
      return addressBookSourceUnavailable();
    case "AddressBookProviderFailure":
      return addressBookProviderFailure(error);
    default:
      error satisfies never;
      return addressBookSourceUnavailable();
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
        source: "addressBook",
        addressBookReference: entry.reference,
        shippingAddress: entry.address,
      })
    : Effect.fail(addressBookEntryUnavailable(entry.reference));

const requireCustomerPrincipal = (context: CommerceRequestContext) =>
  context.principal instanceof CustomerCommercePrincipal
    ? Effect.succeed(context.principal)
    : Effect.fail(addressBookSourceUnavailable());

export const resolveCheckoutDeliveryDetails = Effect.fn(
  "CheckoutSession.resolveCheckoutDeliveryDetails"
)(function* (
  context: CommerceRequestContext,
  input: CheckoutDeliveryDetailsInput,
  addressBook: AddressBookService
): Effect.fn.Return<ResolvedCheckoutDeliveryDetails, CheckoutMutationFailure> {
  if (input.type === "manual" && !input.saveToAddressBook) {
    return {
      deliveryDetails: {
        source: "manual",
        shippingAddress: input.shippingAddress,
      },
    };
  }

  const principal = yield* requireCustomerPrincipal(context);

  if (input.type === "addressBook") {
    const entry = yield* addressBook
      .get(principal, input.addressBookReference)
      .pipe(Effect.mapError(mapAddressBookGetError));

    return {
      deliveryDetails: yield* shippingDeliveryDetailsFromEntry(entry),
    };
  }

  const reference = AddressBookReference.make(yield* Random.nextUUIDv4);
  const entry = yield* addressBook
    .save(
      principal,
      new SaveAddressBookEntryInput({
        reference,
        address: input.shippingAddress,
        types: ["shipping"],
        defaultShipping: input.makeDefaultShipping,
        defaultBilling: false,
      })
    )
    .pipe(
      Effect.mapError((error) =>
        error._tag === "AddressBookAccessDenied"
          ? addressBookSourceUnavailable()
          : addressBookProviderFailure(error)
      )
    );

  return {
    deliveryDetails: yield* shippingDeliveryDetailsFromEntry(entry),
    savedAddressBookReference: entry.reference,
  };
});

export const withSavedAddressBookReference = (
  error: CheckoutSaveDeliveryDetailsFailure,
  addressBookReference: AddressBookReference | undefined
): CheckoutSaveDeliveryDetailsFailure => {
  if (addressBookReference === undefined) {
    return error;
  }

  switch (error._tag) {
    case "CheckoutVersionConflict":
      return new CheckoutVersionConflict({
        message: error.message,
        cartId: error.cartId,
        addressBookReference,
      });
    case "CheckoutMutationProviderFailure":
      return new CheckoutMutationProviderFailure({
        message: error.message,
        operation: error.operation,
        ...(error.cause === undefined ? {} : { cause: error.cause }),
        addressBookReference,
      });
    default:
      return error;
  }
};

export const ensureCurrentCartIdentity = (
  currentCart: CartSnapshot,
  submittedCart: CheckoutCartReference,
  detailName: "Contact" | "Delivery Details" = "Contact"
) => {
  if (currentCart.id !== submittedCart.id) {
    return Effect.fail(
      new CheckoutCartMismatch({
        message: `${detailName} belongs to a different Checkout Cart`,
        submittedCartId: submittedCart.id,
        currentCartId: currentCart.id,
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
    ) => Effect.Effect<CheckoutState, CheckoutSaveContactFailure>;
    readonly saveDeliveryDetails: (
      input: SaveCheckoutDeliveryDetailsInput
    ) => Effect.Effect<
      SaveCheckoutDeliveryDetailsResult,
      CheckoutSaveDeliveryDetailsFailure
    >;
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

  static readonly layer = Layer.effect(
    CheckoutSession,
    Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const policies = yield* CheckoutPolicies;
      const commerceAccounts = yield* CommerceAccounts;
      const addressBook = yield* AddressBook;

      const buyerContextFor = (
        scope: CheckoutScope,
        cart: CartSnapshot
      ): CheckoutBuyerContext =>
        scope.channel === "storefrontAnonymous"
          ? guestBuyerContext
          : {
              buyerMode: "b2bCustomer",
              requiresBuyingContext: true,
              ...(cart.buyingContext === undefined
                ? {}
                : { buyingContext: cart.buyingContext }),
            };

      const buildState = Effect.fn("CheckoutSession.buildState")(
        (scope: CheckoutScope, current: CurrentCartState) =>
          Effect.gen(function* () {
            const buyerContext = buyerContextFor(scope, current.cart);
            const checkoutPolicyViolations = yield* policies.evaluate({
              cart: current.cart,
              details: current.cart.checkoutDetails,
              buyerContext,
            });
            return yield* buildCheckoutState({
              scope,
              cart: current.cart,
              details: current.cart.checkoutDetails,
              buyerContext,
              allowedContactSources: allowedContactSourcesForCheckout(scope),
              cartPolicyViolations: current.violations,
              checkoutPolicyViolations,
            });
          })
      );

      const readFailure = (error: CurrentCartReadFailure) =>
        new CheckoutProviderFailure({
          message: "Failed to resolve Checkout Cart",
          operation: `checkout.currentCart.${error._tag}`,
          cause: error,
        });

      const mutationFailure = (error: SaveCurrentCartDetailsFailure) => {
        switch (error._tag) {
          case "CurrentCartUnavailable":
            return new CheckoutUnavailable({
              message: "Checkout requires an existing Cart",
              reason: error.reason,
            });
          case "CartWriteConflict":
            return new CheckoutVersionConflict({
              message: "Checkout Cart changed while it was being updated",
              cartId: error.cartId,
            });
          default:
            return new CheckoutMutationProviderFailure({
              message: "Failed to update Checkout Cart",
              operation: `checkout.currentCart.${error._tag}`,
              cause: error,
            });
        }
      };

      const mutationReadFailure = (error: CheckoutProviderFailure) =>
        new CheckoutMutationProviderFailure({
          message: error.message,
          operation: error.operation,
          cause: error,
        });

      const requireCurrent = (scope: CheckoutScope) =>
        currentCart.get().pipe(
          Effect.mapError(readFailure),
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
            buildState(scope, current).pipe(Effect.as(current))
          )
        );

      return CheckoutSession.of({
        getCurrent: (scope) =>
          requireCurrent(scope).pipe(
            Effect.flatMap((current) => buildState(scope, current))
          ),
        saveContact: (input) =>
          Effect.gen(function* () {
            const allowedContactSources = allowedContactSourcesForCheckout(
              input.scope
            );
            if (!allowedContactSources.includes(input.contact.source)) {
              return yield* contactSourceUnavailable(input.contact.source);
            }
            const contact = yield* resolveCheckoutContact(
              input.scope,
              input.contact,
              commerceAccounts
            );
            const current = yield* requireCurrent(input.scope).pipe(
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? mutationReadFailure(error)
                  : error
              )
            );
            yield* ensureCurrentCartIdentity(current.cart, input.cart);
            const updated = yield* currentCart
              .saveContact(contact)
              .pipe(Effect.mapError(mutationFailure));
            return yield* buildState(input.scope, updated);
          }),
        saveDeliveryDetails: (input) =>
          Effect.gen(function* () {
            const normalizedInput =
              yield* normalizeCheckoutDeliveryDetailsInput(
                input.deliveryDetails
              );
            const scope =
              input.context.principal instanceof CustomerCommercePrincipal
                ? new StorefrontCustomerCheckoutScope({
                    channel: "storefrontCustomer",
                    locale: input.context.locale,
                    customerId: input.context.principal.customerId,
                    businessUnitId: input.context.principal.businessUnitId,
                    businessUnitKey: input.context.principal.businessUnitKey,
                  })
                : new StorefrontAnonymousCheckoutScope({
                    channel: "storefrontAnonymous",
                    locale: input.context.locale,
                    anonymousCartId: input.context.principal.anonymousCartId,
                  });
            const current = yield* requireCurrent(scope).pipe(
              Effect.mapError((error) =>
                error._tag === "CheckoutProviderFailure"
                  ? mutationReadFailure(error)
                  : error
              )
            );
            yield* ensureCurrentCartIdentity(
              current.cart,
              input.cart,
              "Delivery Details"
            );
            const resolved = yield* resolveCheckoutDeliveryDetails(
              input.context,
              normalizedInput,
              addressBook
            );
            const updated = yield* currentCart
              .saveDeliveryDetails(resolved.deliveryDetails)
              .pipe(
                Effect.mapError((error) =>
                  withSavedAddressBookReference(
                    mutationFailure(error),
                    resolved.savedAddressBookReference
                  )
                )
              );
            const state = yield* buildState(scope, updated);
            return saveDeliveryDetailsResult(resolved, state);
          }),
      });
    })
  );
}
