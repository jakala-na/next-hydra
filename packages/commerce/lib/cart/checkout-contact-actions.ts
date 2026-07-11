import type { CheckoutContact } from "../../domain/checkout";
import type { Cart } from "../types";
import { type ActionResult, domainError, Err, Ok } from "../utils/errors";

export const CHECKOUT_CART_CUSTOM_TYPE_KEY = "hydra-cart-checkout";
export const CHECKOUT_CONTACT_CUSTOM_FIELD_NAME = "checkoutContact";

type SaveCheckoutContactAction =
  | {
      readonly setCustomerEmail: {
        readonly email: string;
      };
    }
  | {
      readonly setCustomField: {
        readonly name: string;
        readonly value: string;
      };
    }
  | {
      readonly setCustomType: {
        readonly typeKey: string;
        readonly fields: [
          {
            readonly name: string;
            readonly value: string;
          },
        ];
      };
    };

type CartCustomTypeConflictDetails = {
  readonly actualTypeKey: string;
  readonly expectedTypeKey: typeof CHECKOUT_CART_CUSTOM_TYPE_KEY;
};

const checkoutContactCustomFieldValue = (contact: CheckoutContact) =>
  JSON.stringify(JSON.stringify(contact));

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
  cart: Pick<Cart, "checkoutDetails" | "customerEmail">,
  contact: CheckoutContact
) =>
  contactsEqual(cart.checkoutDetails?.contact, contact) &&
  cart.customerEmail === contact.buyerContact.email;

const cartCustomTypeConflict = (actualTypeKey: string | undefined) =>
  Err(
    domainError<CartCustomTypeConflictDetails>(
      "UNKNOWN",
      "Cart custom type cannot store checkout contact",
      {
        actualTypeKey: actualTypeKey ?? "<unavailable>",
        expectedTypeKey: CHECKOUT_CART_CUSTOM_TYPE_KEY,
      }
    )
  );

export const buildSaveCheckoutContactActions = (
  cart: Pick<Cart, "custom">,
  contact: CheckoutContact
): ActionResult<SaveCheckoutContactAction[], CartCustomTypeConflictDetails> => {
  const field = {
    name: CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
    value: checkoutContactCustomFieldValue(contact),
  };
  const customTypeKey = cart.custom?.type?.key;

  if (
    cart.custom !== null &&
    cart.custom !== undefined &&
    customTypeKey !== CHECKOUT_CART_CUSTOM_TYPE_KEY
  ) {
    return cartCustomTypeConflict(customTypeKey);
  }

  return Ok([
    {
      setCustomerEmail: {
        email: contact.buyerContact.email,
      },
    },
    customTypeKey === CHECKOUT_CART_CUSTOM_TYPE_KEY
      ? {
          setCustomField: field,
        }
      : {
          setCustomType: {
            typeKey: CHECKOUT_CART_CUSTOM_TYPE_KEY,
            fields: [field],
          },
        },
  ]);
};
