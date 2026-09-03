import type {
  ByProjectKeyRequestBuilder,
  Payment,
} from "@commercetools/platform-sdk";
import { Effect, Option, Schema } from "effect";

import {
  customFieldsBuilder,
  customFieldsReader,
  PaymentCustomFields,
  REST_CUSTOM_TYPE_EXPANSION,
} from "../custom-fields";
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

export interface CheckoutPaymentTransactionSnapshot {
  readonly state: string;
  readonly type: string;
}

export interface SelectedCheckoutPaymentSnapshot extends SelectedPaymentProvider {
  readonly method: string;
  readonly transactions: readonly CheckoutPaymentTransactionSnapshot[];
}

export interface CardCaptureFailurePreparation extends CheckoutPaymentResource {
  readonly amount: {
    readonly centAmount: number;
    readonly currencyCode: string;
  };
  readonly attemptReference: string;
  readonly confirmationReference: string;
}

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

const toPaymentResource = (payment: Payment): CheckoutPaymentResource => {
  const provider = payment.paymentMethodInfo.paymentInterface;
  const providerReference = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.NonEmptyString)(payment.interfaceId)
  );
  if (providerReference === undefined || provider === undefined) {
    throw new Error(`Payment ${payment.id} has no provider identity`);
  }
  return {
    paymentReference: payment.id,
    provider,
    providerReference,
    version: payment.version,
  };
};

export const makeCommercetoolsPaymentTestControl = (
  apiRoot: ByProjectKeyRequestBuilder
) => {
  const findPaymentByKey = async (key: string): Promise<Payment | null> => {
    try {
      const response = await apiRoot
        .payments()
        .withKey({ key })
        .get()
        .execute();
      return response.body;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  };

  const findByKey = async (
    key: string
  ): Promise<CheckoutPaymentResource | null> => {
    const payment = await findPaymentByKey(key);
    return payment === null ? null : toPaymentResource(payment);
  };

  const paymentSnapshot = (
    payment: Payment
  ): SelectedCheckoutPaymentSnapshot => {
    const identity = toPaymentResource(payment);
    return {
      method: payment.paymentMethodInfo.method ?? "",
      provider: identity.provider,
      providerReference: identity.providerReference,
      transactions: payment.transactions.map((transaction) => ({
        state: transaction.state,
        type: transaction.type,
      })),
    };
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
    getCardCaptureFailurePreparation: async (
      cartId: string
    ): Promise<CardCaptureFailurePreparation> => {
      const cart = await apiRoot.carts().withId({ ID: cartId }).get().execute();
      const [selected] = cart.body.paymentInfo?.payments ?? [];
      if (selected === undefined) {
        throw new Error(`Cart ${cartId} has no selected Payment`);
      }
      const response = await apiRoot
        .payments()
        .withId({ ID: selected.id })
        .get({ queryArgs: { expand: REST_CUSTOM_TYPE_EXPANSION } })
        .execute();
      const payment = response.body;
      const identity = toPaymentResource(payment);
      if (payment.paymentMethodInfo.method !== "card") {
        throw new Error(`Cart ${cartId} does not use a Card Payment`);
      }
      const fields = Option.getOrThrow(
        await Effect.runPromise(
          customFieldsReader.fromRest(PaymentCustomFields, payment.custom).read
        )
      );
      const attemptReference = Schema.decodeUnknownSync(Schema.NonEmptyString)(
        fields.checkoutPlacementAttemptReference
      );
      const confirmationReference = Schema.decodeUnknownSync(
        Schema.NonEmptyString
      )(payment.paymentMethodInfo.token?.value);
      return {
        ...identity,
        amount: payment.amountPlanned,
        attemptReference,
        confirmationReference,
      };
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
    getForCheckoutAssertion: async (
      cartId: string
    ): Promise<SelectedCheckoutPaymentSnapshot> => {
      const cart = await apiRoot.carts().withId({ ID: cartId }).get().execute();
      const payments = cart.body.paymentInfo?.payments ?? [];
      const [selected] = payments;
      if (selected !== undefined && payments.length === 1) {
        const response = await apiRoot
          .payments()
          .withId({ ID: selected.id })
          .get()
          .execute();
        return paymentSnapshot(response.body);
      }
      if (payments.length !== 0) {
        throw new Error(
          `Expected Cart ${cartId} to have one selected Payment, received ${payments.length}`
        );
      }
      const persistedPayments = await Promise.all([
        findPaymentByKey(cardPaymentKeyForCheckout(cartId)),
        findPaymentByKey(netTermsPaymentKeyForCheckout(cartId)),
      ]);
      const persisted = persistedPayments.filter(
        (payment): payment is Payment => payment !== null
      );
      if (persisted.length !== 1 || persisted[0] === undefined) {
        throw new Error(
          `Expected Checkout ${cartId} to have one persisted Payment, received ${persisted.length}`
        );
      }
      return paymentSnapshot(persisted[0]);
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
    recordSuccessfulAuthorization: async (
      payment: CardCaptureFailurePreparation,
      authorization: {
        readonly cardBrand: string;
        readonly lastFour: string;
        readonly providerTransactionReference: string;
      }
    ): Promise<void> => {
      const current = await apiRoot
        .payments()
        .withId({ ID: payment.paymentReference })
        .get({ queryArgs: { expand: REST_CUSTOM_TYPE_EXPANSION } })
        .execute();
      const cardFieldActions = await Effect.runPromise(
        customFieldsBuilder
          .forType(PaymentCustomFields)
          .set("checkoutCardBrand", authorization.cardBrand)
          .set("checkoutCardLastFour", authorization.lastFour)
          .againstRest(current.body.custom)
          .toRestUpdateActions()
      );
      await apiRoot
        .payments()
        .withId({ ID: payment.paymentReference })
        .post({
          body: {
            actions: [
              {
                action: "addTransaction",
                transaction: {
                  amount: payment.amount,
                  interactionId: `${payment.attemptReference}:authorize`,
                  interfaceId: authorization.providerTransactionReference,
                  state: "Success",
                  type: "Authorization",
                },
              },
              ...cardFieldActions,
            ],
            version: current.body.version,
          },
        })
        .execute();
    },
  };
};
