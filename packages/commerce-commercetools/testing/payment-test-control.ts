import type {
  ByProjectKeyRequestBuilder,
  Payment,
} from "@commercetools/platform-sdk";
import { Schema } from "effect";

import {
  cardPaymentKeyForCheckout,
  netTermsPaymentKeyForCheckout,
} from "../payment-repository/keys";

export interface SelectedPaymentProvider {
  readonly provider: string;
  readonly providerReference: string;
}

export interface CheckoutPaymentResource extends SelectedPaymentProvider {
  readonly paymentReference: string;
  readonly version: number;
}

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

const toPaymentResource = (payment: Payment): CheckoutPaymentResource => {
  const { interfaceId } = payment;
  const provider = payment.paymentMethodInfo.paymentInterface;
  if (interfaceId === undefined || provider === undefined) {
    throw new Error(`Payment ${payment.id} has no provider identity`);
  }
  return {
    paymentReference: payment.id,
    provider,
    providerReference: interfaceId,
    version: payment.version,
  };
};

export const makeCommercetoolsPaymentTestControl = (
  apiRoot: ByProjectKeyRequestBuilder
) => {
  const findByKey = async (
    key: string
  ): Promise<CheckoutPaymentResource | null> => {
    try {
      const response = await apiRoot
        .payments()
        .withKey({ key })
        .get()
        .execute();
      return toPaymentResource(response.body);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  };

  return {
    delete: async (payment: CheckoutPaymentResource): Promise<void> => {
      try {
        await apiRoot
          .payments()
          .withId({ ID: payment.paymentReference })
          .delete({ queryArgs: { version: payment.version } })
          .execute();
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
    getForCheckout: async (
      cartId: string
    ): Promise<readonly CheckoutPaymentResource[]> => {
      const payments = await Promise.all([
        findByKey(cardPaymentKeyForCheckout(cartId)),
        findByKey(netTermsPaymentKeyForCheckout(cartId)),
      ]);
      return payments.filter(
        (payment): payment is CheckoutPaymentResource => payment !== null
      );
    },
    getSelectedProvider: async (
      cartId: string
    ): Promise<SelectedPaymentProvider> => {
      const cart = await apiRoot.carts().withId({ ID: cartId }).get().execute();
      const payments = cart.body.paymentInfo?.payments ?? [];
      if (payments.length !== 1) {
        throw new Error(
          `Expected Cart ${cartId} to have one selected Payment, received ${payments.length}`
        );
      }
      const [selected] = payments;
      if (selected === undefined) {
        throw new Error(`Cart ${cartId} has no selected Payment`);
      }
      const payment = await apiRoot
        .payments()
        .withId({ ID: selected.id })
        .get()
        .execute();
      const selectedPayment = toPaymentResource(payment.body);
      return {
        provider: selectedPayment.provider,
        providerReference: selectedPayment.providerReference,
      };
    },
  };
};
