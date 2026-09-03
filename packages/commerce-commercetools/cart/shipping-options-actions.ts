import type { CartUpdateAction } from "@commercetools/platform-sdk";
import type { SelectedDeliveryPlan } from "@repo/commerce/domain/delivery-plan";

import {
  deliveryAddressKeyFor,
  isDeliveryAddressKey,
  shippingKeyFor,
  shippingMethodIdFrom,
} from "../delivery-planning/references";
import { toCommercetoolsAddress } from "./address-mapping";
import type { CommercetoolsCart } from "./provider-cart";

/**
 * Removes the complete delivery-plan projection. Cart contents or delivery
 * details can then change without leaving stale routing attached to the Cart.
 */
export const clearSelectedDeliveryPlanActions = (
  cart: Pick<
    CommercetoolsCart,
    "itemShippingAddresses" | "lineItems" | "shipping"
  >
): CartUpdateAction[] => [
  ...cart.lineItems.flatMap((lineItem): CartUpdateAction[] =>
    lineItem.shippingDetails === null || lineItem.shippingDetails === undefined
      ? []
      : [
          {
            action: "setLineItemShippingDetails",
            lineItemId: lineItem.id,
          },
        ]
  ),
  ...cart.shipping.map(
    (shipping): CartUpdateAction => ({
      action: "removeShippingMethod",
      shippingKey: shipping.shippingKey,
    })
  ),
  ...cart.itemShippingAddresses.flatMap((address): CartUpdateAction[] =>
    address.key !== null &&
    address.key !== undefined &&
    isDeliveryAddressKey(address.key)
      ? [
          {
            action: "removeItemShippingAddress",
            addressKey: address.key,
          },
        ]
      : []
  ),
];

export const buildSaveShippingOptionsActions = (
  cart: Pick<
    CommercetoolsCart,
    "itemShippingAddresses" | "lineItems" | "shipping"
  >,
  selectedPlan: SelectedDeliveryPlan
): CartUpdateAction[] => {
  const groupRouting = selectedPlan.groups.map((group) => {
    const shippingMethodId = shippingMethodIdFrom(
      group.selectedShippingOption.reference
    );
    if (shippingMethodId === undefined) {
      throw new Error(
        `Shipping Option ${group.selectedShippingOption.reference} is not a Commercetools Shipping Method reference`
      );
    }

    const addressKey = deliveryAddressKeyFor(group.reference);
    const shippingKey = shippingKeyFor(
      group.reference,
      selectedPlan.quoteReference,
      selectedPlan.reference
    );

    return { addressKey, group, shippingKey, shippingMethodId };
  });

  const addAddresses = groupRouting.map(
    ({ addressKey, group }): CartUpdateAction => ({
      action: "addItemShippingAddress",
      address: toCommercetoolsAddress(group.shippingAddress, addressKey),
    })
  );
  const addShippingMethods = groupRouting.map(
    ({
      addressKey,
      group,
      shippingKey,
      shippingMethodId,
    }): CartUpdateAction => ({
      action: "addShippingMethod",
      shippingAddress: toCommercetoolsAddress(
        group.shippingAddress,
        addressKey
      ),
      shippingKey,
      shippingMethod: { id: shippingMethodId, typeId: "shipping-method" },
    })
  );
  const setTargets = cart.lineItems.map(
    (lineItem): CartUpdateAction => ({
      action: "setLineItemShippingDetails",
      lineItemId: lineItem.id,
      shippingDetails: {
        targets: groupRouting.flatMap(({ addressKey, group, shippingKey }) =>
          group.targets
            .filter((target) => target.lineItemId === lineItem.id)
            .map((target) => ({
              addressKey,
              quantity: target.quantity,
              shippingMethodKey: shippingKey,
            }))
        ),
      },
    })
  );

  return [
    ...clearSelectedDeliveryPlanActions(cart),
    ...addAddresses,
    ...addShippingMethods,
    ...setTargets,
  ];
};
