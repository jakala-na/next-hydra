import { CartProviderFailure } from "@repo/commerce/domain/cart-errors";
import type { CheckoutContact } from "@repo/commerce/domain/checkout";
import { Effect } from "effect";

import { customFieldsBuilder } from "../custom-fields";
import { CheckoutOrderCustomFields } from "./checkout-custom-fields";
import type { CommercetoolsCart } from "./provider-cart";

export const ORDER_CUSTOM_TYPE_KEY = CheckoutOrderCustomFields.typeKey;

const contactsEqual = (
  left: CheckoutContact | undefined,
  right: CheckoutContact
) =>
  left?.source === right.source &&
  left.buyerContact.email === right.buyerContact.email &&
  left.buyerContact.firstName === right.buyerContact.firstName &&
  left.buyerContact.lastName === right.buyerContact.lastName &&
  left.buyerContact.phoneNumber === right.buyerContact.phoneNumber;

export const hasPersistedCheckoutContact = (
  cart: Pick<CommercetoolsCart, "checkoutDetails" | "customerEmail">,
  contact: CheckoutContact
) =>
  contactsEqual(cart.checkoutDetails?.contact, contact) &&
  cart.customerEmail === contact.buyerContact.email;

export const buildSaveCheckoutContactUpdate = (
  cart: Pick<CommercetoolsCart, "custom">,
  contact: CheckoutContact
) =>
  customFieldsBuilder
    .forType(CheckoutOrderCustomFields)
    .set("checkoutContact", contact)
    .againstGraphql(cart.custom)
    .mapError(
      (cause) =>
        new CartProviderFailure({
          cause,
          operation: "saveContact",
          reason: "invalidData",
        })
    );

export const buildSaveCheckoutContactActions = (
  cart: Pick<CommercetoolsCart, "custom">,
  contact: CheckoutContact
) =>
  buildSaveCheckoutContactUpdate(cart, contact)
    .toGraphqlUpdateActions()
    .pipe(
      Effect.map((customFieldActions) => [
        {
          setCustomerEmail: {
            email: contact.buyerContact.email,
          },
        },
        ...customFieldActions,
      ])
    );
