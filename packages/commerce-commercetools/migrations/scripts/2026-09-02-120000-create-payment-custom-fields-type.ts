import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

const PAYMENT_CUSTOM_TYPE_KEY = "paymentCustomFields";

export const migration: MigrationDefinition = {
  description: "Create the shared Payment Custom Type",
  name: "Create Payment Custom Fields Type",
  async up(apiRoot) {
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
