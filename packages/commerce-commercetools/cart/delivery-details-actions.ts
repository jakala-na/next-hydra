import { CartProviderFailure } from "@repo/commerce/domain/cart-errors";
import type { CheckoutDeliveryDetails } from "@repo/commerce/domain/checkout";
import { checkoutDeliveryDetailsEqual } from "@repo/commerce/lib/checkout/delivery-details-equality";

import { customFieldsBuilder } from "../custom-fields";
import { CheckoutOrderCustomFields } from "./checkout-custom-fields";
import type { CommercetoolsCart } from "./provider-cart";

export const hasPersistedCheckoutDeliveryDetails = (
  cart: Pick<CommercetoolsCart, "checkoutDetails">,
  deliveryDetails: CheckoutDeliveryDetails
) => {
  const persistedDeliveryDetails = cart.checkoutDetails?.deliveryDetails;

  if (persistedDeliveryDetails === undefined) {
    return false;
  }

  return checkoutDeliveryDetailsEqual(
    persistedDeliveryDetails,
    deliveryDetails
  );
};

export const buildSaveCheckoutDeliveryDetailsUpdate = (
  cart: Pick<CommercetoolsCart, "custom">,
  deliveryDetails: CheckoutDeliveryDetails
) =>
  customFieldsBuilder
    .forType(CheckoutOrderCustomFields)
    .set("checkoutDeliveryDetails", deliveryDetails)
    .againstGraphql(cart.custom)
    .mapError(
      (cause) =>
        new CartProviderFailure({
          cause,
          operation: "saveDeliveryDetails",
          reason: "invalidData",
        })
    );

export const buildSaveCheckoutDeliveryDetailsActions = (
  cart: Pick<CommercetoolsCart, "custom">,
  deliveryDetails: CheckoutDeliveryDetails
) =>
  buildSaveCheckoutDeliveryDetailsUpdate(
    cart,
    deliveryDetails
  ).toGraphqlUpdateActions();
