import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

const PAYMENT_CUSTOM_TYPE_KEY = "checkoutPaymentFields";

export const migration: MigrationDefinition = {
  description: "Add Checkout preparation fields to Payments",
  name: "Add Checkout Payment Fields",
  async up(apiRoot) {
    const paymentType = await migrationClient(apiRoot)
      .ensureType(PAYMENT_CUSTOM_TYPE_KEY, {
        description: {
          "en-US": "Checkout assertions attached to a Payment",
        },
        name: { "en-US": "Checkout Payment Fields" },
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
