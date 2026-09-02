import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { Schema } from "effect";

import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

const LEGACY_PAYMENT_CUSTOM_TYPE_KEY = "checkoutPaymentFields";
const PAYMENT_CUSTOM_TYPE_KEY = "paymentCustomFields";
const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

const deleteLegacyPaymentCustomType = async (
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> => {
  try {
    const response = await apiRoot
      .types()
      .withKey({ key: LEGACY_PAYMENT_CUSTOM_TYPE_KEY })
      .get()
      .execute();

    await apiRoot
      .types()
      .withKey({ key: LEGACY_PAYMENT_CUSTOM_TYPE_KEY })
      .delete({ queryArgs: { version: response.body.version } })
      .execute();
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
};

export const migration: MigrationDefinition = {
  description:
    "Replace the legacy checkout Payment Custom Type with the shared Payment Custom Type",
  name: "Create Payment Custom Fields Type",
  async up(apiRoot) {
    await deleteLegacyPaymentCustomType(apiRoot);

    const paymentType = await migrationClient(apiRoot)
      .ensureType(PAYMENT_CUSTOM_TYPE_KEY, {
        description: {
          "en-US": "Custom fields persisted on a Payment",
        },
        name: { "en-US": "Payment Custom Fields" },
        resourceTypeIds: ["payment"],
      })
      .init();

    if (!paymentType.fieldExists("checkoutPlacementAttemptReference")) {
      paymentType.addStringField("checkoutPlacementAttemptReference", {
        "en-US": "Checkout placement attempt reference",
      });
    }
    if (!paymentType.fieldExists("checkoutTermsInDays")) {
      paymentType.addNumberField("checkoutTermsInDays", {
        "en-US": "Net Terms duration in days",
      });
    }
    if (!paymentType.fieldExists("checkoutCardBrand")) {
      paymentType.addStringField("checkoutCardBrand", {
        "en-US": "Card brand",
      });
    }
    if (!paymentType.fieldExists("checkoutCardLastFour")) {
      paymentType.addStringField("checkoutCardLastFour", {
        "en-US": "Card last four digits",
      });
    }

    await paymentType.execute();
  },
};
