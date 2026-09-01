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

    if (!paymentType.fieldExists("checkoutConfirmationReference")) {
      paymentType.addStringField("checkoutConfirmationReference", {
        "en-US": "Card confirmation reference",
      });
    }
    if (!paymentType.fieldExists("checkoutTermsInDays")) {
      paymentType.addNumberField("checkoutTermsInDays", {
        "en-US": "Net Terms duration in days",
      });
    }

    await paymentType.execute();
  },
};
