import { Schema } from "effect";

import {
  CartLineItem,
  CartSnapshot,
  CurrentCartState,
} from "../domain/cart-snapshot";
import { CheckoutDetails } from "../domain/checkout";
import type { Money as MoneyType } from "../domain/money";
import { Money, money } from "../domain/money";
import { ProductImage } from "../product/image";

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
    const amount = money(
      details.preparedPayment.amount.centAmount,
      details.preparedPayment.amount.currencyCode
    );
    projected.preparedPayment =
      details.preparedPayment.method === "card"
        ? { amount, method: "card" }
        : {
            amount,
            method: "netTerms",
            termsInDays: details.preparedPayment.termsInDays,
          };
  }

  return projected;
};

export const CartPublicSnapshot = Schema.Struct({
  checkoutDetails: CartPublicCheckoutDetails,
  id: CartSnapshot.fields.id,
  lineItems: CartSnapshot.fields.lineItems,
  status: CartSnapshot.fields.status,
  storeKey: CartSnapshot.fields.storeKey,
  totalLineItemQuantity: CartSnapshot.fields.totalLineItemQuantity,
  totalPrice: CartSnapshot.fields.totalPrice,
  version: CartSnapshot.fields.version,
});
export type CartPublicSnapshot = typeof CartPublicSnapshot.Type;

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
  version: cart.version,
});

export const CartReadModelLineItem = Schema.Struct({
  id: CartLineItem.fields.id,
  image: Schema.optional(ProductImage),
  lineTotal: Money,
  name: Schema.String,
  quantity: CartLineItem.fields.quantity,
  summaryAttribute: CartLineItem.fields.variant.fields.summaryAttribute,
  unitPrice: Money,
});
export type CartReadModelLineItem = typeof CartReadModelLineItem.Type;

type MutableCartReadModelLineItem = {
  -readonly [Key in keyof CartReadModelLineItem]: CartReadModelLineItem[Key];
};

export const CartReadModelSummary = Schema.Struct({
  shipping: Schema.optional(Money),
  subtotal: Money,
  total: Money,
});
export type CartReadModelSummary = typeof CartReadModelSummary.Type;

type MutableCartReadModelSummary = {
  -readonly [Key in keyof CartReadModelSummary]: CartReadModelSummary[Key];
};

export const CartReadModel = Schema.Struct({
  id: CartSnapshot.fields.id,
  lineItems: Schema.Array(CartReadModelLineItem),
  status: CartSnapshot.fields.status,
  storeKey: CartSnapshot.fields.storeKey,
  summary: CartReadModelSummary,
  totalLineItemQuantity: CartSnapshot.fields.totalLineItemQuantity,
  version: CartSnapshot.fields.version,
});
export type CartReadModel = typeof CartReadModel.Type;

export const CartPublicState = Schema.Struct({
  cart: CartReadModel,
  violations: CurrentCartState.fields.violations,
});
export type CartPublicState = typeof CartPublicState.Type;
export type CartPublicStateEncoded = typeof CartPublicState.Encoded;

/** Explicit presentation state for a Current Cart provider outage. */
export const CART_UNAVAILABLE = { _tag: "CartUnavailable" } as const;
export type CartUnavailable = typeof CART_UNAVAILABLE;
export type CartProviderState = CartPublicState | CartUnavailable | null;

export const isCartUnavailable = (
  state: CartProviderState
): state is CartUnavailable =>
  state !== null && "_tag" in state && state._tag === "CartUnavailable";

export const CartPublicStateIdentity = Schema.String.pipe(
  Schema.brand("CartPublicStateIdentity")
);
export type CartPublicStateIdentity = typeof CartPublicStateIdentity.Type;

export function cartPublicStateIdentity(
  state: CartPublicStateEncoded | null
): CartPublicStateIdentity {
  return CartPublicStateIdentity.make(
    state === null
      ? "empty"
      : JSON.stringify([state.cart.id, state.cart.version])
  );
}

const moneyInCurrency = (
  value: MoneyType,
  currencyCode: MoneyType["currencyCode"],
  source: string
): MoneyType => {
  if (value.currencyCode !== currencyCode) {
    throw new Error(
      `${source} uses ${value.currencyCode}; expected ${currencyCode}`
    );
  }
  return value;
};

const addMoney = (
  values: readonly MoneyType[],
  currencyCode: MoneyType["currencyCode"],
  source: string
): MoneyType =>
  money(
    values.reduce(
      (total, value) =>
        total + moneyInCurrency(value, currencyCode, source).centAmount,
      0
    ),
    currencyCode
  );

export const toCartReadModel = (cart: CartSnapshot): CartReadModel => {
  const { currencyCode } = cart.totalPrice;
  const lineItems = cart.lineItems.map((lineItem): CartReadModelLineItem => {
    const unitPrice = moneyInCurrency(
      lineItem.unitPrice,
      currencyCode,
      `Cart Line Item ${lineItem.id} unit price`
    );
    const lineTotal =
      lineItem.totalPrice === undefined
        ? money(unitPrice.centAmount * lineItem.quantity, currencyCode)
        : moneyInCurrency(
            lineItem.totalPrice,
            currencyCode,
            `Cart Line Item ${lineItem.id} total`
          );
    const [image] = lineItem.variant.images;
    const projected: MutableCartReadModelLineItem = {
      id: lineItem.id,
      lineTotal,
      name: lineItem.variant.name ?? "",
      quantity: lineItem.quantity,
      unitPrice,
    };
    if (image !== undefined) {
      projected.image = image;
    }
    if (lineItem.variant.summaryAttribute !== undefined) {
      projected.summaryAttribute = lineItem.variant.summaryAttribute;
    }
    return projected;
  });
  const { selectedDeliveryPlan } = cart.checkoutDetails;
  const shipping =
    selectedDeliveryPlan === undefined
      ? undefined
      : addMoney(
          selectedDeliveryPlan.groups.map(
            (group) => group.selectedShippingOption.price
          ),
          currencyCode,
          `Cart ${cart.id} Shipping Options`
        );
  const summary: MutableCartReadModelSummary = {
    subtotal: addMoney(
      lineItems.map((lineItem) => lineItem.lineTotal),
      currencyCode,
      `Cart ${cart.id} Line Items`
    ),
    total: moneyInCurrency(
      cart.totalPrice,
      currencyCode,
      `Cart ${cart.id} total`
    ),
  };
  if (shipping !== undefined) {
    summary.shipping = shipping;
  }

  return {
    id: cart.id,
    lineItems,
    status: cart.status,
    storeKey: cart.storeKey,
    summary,
    totalLineItemQuantity: cart.totalLineItemQuantity,
    version: cart.version,
  };
};

export const toCartPublicState = (
  state: CurrentCartState
): CartPublicState => ({
  cart: toCartReadModel(state.cart),
  violations: state.violations,
});

export const decodeCartPublicState = Schema.decodeUnknownSync(CartPublicState);
