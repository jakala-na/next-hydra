import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { minorAmountFromDecimal } from "@repo/commerce/e2e/checkout-expectations";
import {
  CreditProfile,
  DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
} from "@repo/payments";
import { Schema } from "effect";

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);
type NetTermsAccountSnapshot = CreditProfile;

export const makeCommercetoolsNetTermsTestControl = (
  apiRoot: ByProjectKeyRequestBuilder
) => ({
  delete: async (businessUnitId: string): Promise<void> => {
    try {
      const current = await apiRoot
        .customObjects()
        .withContainerAndKey({
          container: DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
          key: businessUnitId,
        })
        .get()
        .execute();
      await apiRoot
        .customObjects()
        .withContainerAndKey({
          container: DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
          key: businessUnitId,
        })
        .delete({ queryArgs: { version: current.body.version } })
        .execute();
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  },
  get: async (businessUnitId: string): Promise<NetTermsAccountSnapshot> => {
    const response = await apiRoot
      .customObjects()
      .withContainerAndKey({
        container: DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
        key: businessUnitId,
      })
      .get()
      .execute();
    return Schema.decodeUnknownSync(CreditProfile)(response.body.value);
  },
  set: async (input: {
    readonly amount: string;
    readonly businessUnitId: string;
    readonly currency: string;
    readonly termsInDays: number;
  }): Promise<void> => {
    await apiRoot
      .customObjects()
      .post({
        body: {
          container: DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER,
          key: input.businessUnitId,
          value: {
            availableCredit: {
              centAmount: Number(minorAmountFromDecimal(input.amount)),
              currencyCode: input.currency,
            },
            termsInDays: input.termsInDays,
          },
        },
      })
      .execute();
  },
});
