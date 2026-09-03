import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

export const migration: MigrationDefinition = {
  description:
    "Add cart-owned checkout delivery details to the shared Cart and Order custom type",
  name: "Add Checkout Delivery Details",
  async up(apiRoot) {
    const builder = await migrationClient(apiRoot)
      .ensureType("orderCustomFields", {
        description: {
          "en-US": "Custom fields persisted on a Cart and copied to its Order",
        },
        name: { "en-US": "Order Custom Fields" },
        resourceTypeIds: ["order"],
      })
      .init();

    if (!builder.fieldExists("checkoutDeliveryDetails")) {
      builder.addStringField(
        "checkoutDeliveryDetails",
        { "en-US": "Checkout delivery details" },
        { inputHint: "MultiLine" }
      );
    }

    await builder.execute();
  },
};
