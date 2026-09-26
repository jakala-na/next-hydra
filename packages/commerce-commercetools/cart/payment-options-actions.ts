import type { CartUpdateAction } from "@commercetools/platform-sdk";
import type { PreparedPayment } from "@repo/payments";

import { toCommercetoolsAddress } from "./address-mapping";
import type { CommercetoolsCart } from "./provider-cart";

export const clearSelectedPaymentActions = (
  cart: Pick<CommercetoolsCart, "paymentIds">
): CartUpdateAction[] => {
  const paymentIds = cart.paymentIds ?? [];
  if (paymentIds.length === 0) {
    return [];
  }

  return [
    ...paymentIds.map(
      (paymentId): CartUpdateAction => ({
        action: "removePayment",
        payment: { id: paymentId, typeId: "payment" },
      })
    ),
    { action: "setBillingAddress" },
  ];
};

export const buildSavePaymentOptionsActions = (
  cart: Pick<CommercetoolsCart, "paymentIds">,
  payment: PreparedPayment
): readonly CartUpdateAction[] => {
  const paymentIds = cart.paymentIds ?? [];
  const paymentActions: CartUpdateAction[] = [
    ...paymentIds
      .filter((paymentId) => paymentId !== payment.paymentReference)
      .map((paymentId) => ({
        action: "removePayment" as const,
        payment: { id: paymentId, typeId: "payment" as const },
      })),
    ...(paymentIds.includes(payment.paymentReference)
      ? []
      : [
          {
            action: "addPayment" as const,
            payment: {
              id: payment.paymentReference,
              typeId: "payment" as const,
            },
          },
        ]),
  ];

  return [
    ...paymentActions,
    {
      action: "setBillingAddress",
      address: toCommercetoolsAddress(payment.billingAddress),
    },
  ];
};
