import "server-only";
import {
  commercetoolsClientsLayer,
  paymentRepositoryLayer,
} from "@repo/commerce-provider/provider";
import { versionedKeyValueStoreLayer } from "@repo/commerce-provider/versioned-store";
import {
  AccountCredit,
  CheckoutPayments,
  DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
} from "@repo/payments";
import { Layer } from "effect";

import { stripeCardPaymentsLayer } from "./card-payments";

const accountCreditLayer = AccountCredit.layerVersionedStore().pipe(
  Layer.provide(
    versionedKeyValueStoreLayer({
      container: DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
    })
  )
);

export const commercetoolsStripeCheckoutPaymentsLayer =
  CheckoutPayments.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        stripeCardPaymentsLayer,
        paymentRepositoryLayer.pipe(Layer.provide(commercetoolsClientsLayer)),
        accountCreditLayer
      )
    )
  );
