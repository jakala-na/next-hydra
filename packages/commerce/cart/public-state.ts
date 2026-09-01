import { Schema } from "effect";

import { CartSnapshot, CurrentCartState } from "../domain/cart-snapshot";
import { CheckoutDetails } from "../domain/checkout";
import { Money } from "../domain/money";

export const CartPublicPreparedPayment = Schema.Union([
  Schema.Struct({
    amount: Money,
    method: Schema.Literal("card"),
  }),
  Schema.Struct({
    amount: Money,
    method: Schema.Literal("netTerms"),
    termsInDays: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
]);
export type CartPublicPreparedPayment = typeof CartPublicPreparedPayment.Type;

export const CartPublicCheckoutDetails = Schema.Struct({
  contact: CheckoutDetails.fields.contact,
  deliveryDetails: CheckoutDetails.fields.deliveryDetails,
  preparedPayment: Schema.optional(CartPublicPreparedPayment),
  selectedDeliveryPlan: CheckoutDetails.fields.selectedDeliveryPlan,
});
export type CartPublicCheckoutDetails = typeof CartPublicCheckoutDetails.Type;

export const CartPublicSnapshot = Schema.Struct({
  checkoutDetails: CartPublicCheckoutDetails,
  id: CartSnapshot.fields.id,
  lineItems: CartSnapshot.fields.lineItems,
  status: CartSnapshot.fields.status,
  storeKey: CartSnapshot.fields.storeKey,
  totalLineItemQuantity: CartSnapshot.fields.totalLineItemQuantity,
  totalPrice: CartSnapshot.fields.totalPrice,
});
export type CartPublicSnapshot = typeof CartPublicSnapshot.Type;

export const CartPublicState = Schema.Struct({
  cart: CartPublicSnapshot,
  violations: CurrentCartState.fields.violations,
});
export type CartPublicState = typeof CartPublicState.Type;
export type CartPublicStateEncoded = typeof CartPublicState.Encoded;

type MutableCartPublicCheckoutDetails = {
  -readonly [Key in keyof CartPublicCheckoutDetails]: CartPublicCheckoutDetails[Key];
};

export const toCartPublicCheckoutDetails = (
  details: CheckoutDetails
): CartPublicCheckoutDetails => {
  const projected: MutableCartPublicCheckoutDetails = {};

  if (details.contact !== undefined) {
    projected.contact = details.contact;
  }
  if (details.deliveryDetails !== undefined) {
    projected.deliveryDetails = details.deliveryDetails;
  }
  if (details.selectedDeliveryPlan !== undefined) {
    projected.selectedDeliveryPlan = details.selectedDeliveryPlan;
  }
  if (details.preparedPayment !== undefined) {
    projected.preparedPayment =
      details.preparedPayment.method === "card"
        ? { amount: details.preparedPayment.amount, method: "card" }
        : {
            amount: details.preparedPayment.amount,
            method: "netTerms",
            termsInDays: details.preparedPayment.termsInDays,
          };
  }

  return projected;
};

export const toCartPublicSnapshot = (
  cart: CartSnapshot
): CartPublicSnapshot => ({
  checkoutDetails: toCartPublicCheckoutDetails(cart.checkoutDetails),
  id: cart.id,
  lineItems: cart.lineItems,
  status: cart.status,
  storeKey: cart.storeKey,
  totalLineItemQuantity: cart.totalLineItemQuantity,
  totalPrice: cart.totalPrice,
});

export const toCartPublicState = (
  state: CurrentCartState
): CartPublicState => ({
  cart: toCartPublicSnapshot(state.cart),
  violations: state.violations,
});
